const { Op, QueryTypes, UniqueConstraintError } = require("sequelize");
const {
  sequelize,
  User,
  Programme,
  MealPeriod,
  MealPeriodOverride,
  MealCard,
  MealServing,
  MealCardDownload,
  MealDownloadGrant,
} = require("../models");
const { buildLedger } = require("./accountingController");
const { evaluateFeatureAccess } = require("../services/accessPolicyService");
const { buildMealCardPdf } = require("../services/mealCardPdfService");
const { logFromRequest, getIpAddress } = require("../middleware/auditLogger");
const { CATERING_ROLE } = require("../middleware/auth");
const meals = require("../services/mealService");

function profileImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) {
    return filename;
  }
  return `/uploads/profiles/${filename}`;
}

function academicYearLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based; academic year often starts ~Aug/Sep
  if (month >= 7) return `${year}/${year + 1}`;
  return `${year - 1}/${year}`;
}

function issuedOnLabel(date = new Date()) {
  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sendError(res, error) {
  const status = error.status || 500;
  const body = { success: false, message: error.message };
  if (error.code) body.code = error.code;
  if (error.data) body.data = error.data;
  return res.status(status).json(body);
}

function pageParams(query, defaultLimit = 10) {
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { limit, page, offset: (page - 1) * limit };
}

const STUDENT_ATTRS = [
  "id",
  "full_name",
  "admission_number",
  "email",
  "profile_image",
  "year_of_study",
  "semester",
  "programme_id",
  "role",
  "is_active",
];

const programmeInclude = {
  model: Programme,
  as: "programme",
  attributes: ["id", "name"],
  required: false,
};

function studentSummary(user) {
  const plain = user.get ? user.get({ plain: true }) : user;
  return {
    id: plain.id,
    full_name: plain.full_name,
    admission_number: plain.admission_number || null,
    programme_name: plain.programme?.name || null,
    year_of_study: plain.year_of_study || null,
    semester: plain.semester || null,
    profile_image_url: profileImageUrl(plain.profile_image),
    is_active: plain.is_active,
  };
}

async function loadStudentCard(userId) {
  const user = await User.findByPk(userId, { attributes: STUDENT_ATTRS, include: [programmeInclude] });

  if (!user || user.role !== "student") {
    throw meals.httpError(404, "Student profile not found");
  }

  const plain = user.get({ plain: true });
  return {
    student_id: plain.id,
    full_name: plain.full_name,
    admission_number: plain.admission_number || null,
    email: plain.email,
    profile_image: plain.profile_image || null,
    profile_image_url: profileImageUrl(plain.profile_image),
    year_of_study: plain.year_of_study || null,
    semester: plain.semester || null,
    programme_id: plain.programme_id || null,
    programme_name: plain.programme?.name || null,
    academic_year: academicYearLabel(),
    issued_on: issuedOnLabel(),
    valid_label: "Current term",
    card_type: "meal",
  };
}

async function evaluateMealAccess(userId) {
  const ledger = await buildLedger(userId);
  const access = await evaluateFeatureAccess("meals", ledger.summary);
  return { access, summary: ledger.summary };
}

async function findStudentForMeals({ student_id, admission_number }) {
  const where = { role: "student" };
  if (student_id) where.id = student_id;
  else if (admission_number) {
    where.admission_number = { [Op.iLike]: String(admission_number).trim() };
  } else {
    throw meals.httpError(400, "student_id or admission_number is required");
  }
  const student = await User.findOne({ where, attributes: STUDENT_ATTRS, include: [programmeInclude] });
  if (!student) throw meals.httpError(404, "Student not found");
  return student;
}

// ── Student portal ───────────────────────────────────────────────────────

/** GET /api/meals/card — preview payload, fee eligibility, download allowance, this month's servings */
exports.getMyMealCard = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const [{ access, summary }, card, allowance, activeCard, served] = await Promise.all([
      evaluateMealAccess(req.user.id),
      loadStudentCard(req.user.id),
      meals.downloadAllowance(req.user.id),
      meals.getActiveCard(req.user.id),
      meals.monthServingMap(req.user.id),
    ]);

    return res.json({
      success: true,
      data: {
        access,
        summary,
        card: access.eligible ? card : null,
        locked_card: card,
        allowance,
        active_card: activeCard
          ? { version: activeCard.version, issued_at: activeCard.issued_at }
          : null,
        served_this_month: served,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/card/pdf — issues a new uniquely-coded card (old one stops scanning) */
exports.downloadMyMealCardPdf = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const { access } = await evaluateMealAccess(req.user.id);
    if (!access.eligible) {
      return res.status(403).json({
        success: false,
        message: access.message || "Fee requirement not met for meal card",
        data: { access },
      });
    }

    const allowance = await meals.downloadAllowance(req.user.id);
    if (allowance.limited && allowance.remaining <= 0) {
      return res.status(403).json({
        success: false,
        code: "download_limit",
        message: `You have used all ${allowance.allowed} meal card downloads allowed between ${allowance.range_start} and ${allowance.range_end}. Ask the school admin to allow another download.`,
        data: { allowance },
      });
    }

    const card = await loadStudentCard(req.user.id);
    const served = await meals.monthServingMap(req.user.id);
    const code = meals.generateCardCode();

    const issued = await sequelize.transaction(async (transaction) => {
      const version = await meals.nextCardVersion(req.user.id, transaction);
      const mealCard = await meals.issueCard(req.user.id, code, version, transaction);
      await MealCardDownload.create(
        {
          student_id: req.user.id,
          card_id: mealCard.id,
          ip_address: getIpAddress(req),
          user_agent: String(req.headers["user-agent"] || "").slice(0, 255) || null,
        },
        { transaction }
      );
      return mealCard;
    });

    const pdf = await buildMealCardPdf(card, {
      qrPayload: meals.qrPayloadForCode(issued.code),
      served,
      version: issued.version,
    });
    const safeAdm = String(card.admission_number || card.student_id)
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 40);
    const filename = `KASMS-MealCard-${safeAdm}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (error) {
    return sendError(res, error);
  }
};

// ── Catering app ─────────────────────────────────────────────────────────

/**
 * POST /api/meals/scan  { code }  — `code` is the raw QR text or the bare card code.
 * Always 200 for business outcomes so the app can render `result` directly:
 * served | already_served | outside_window | card_replaced | card_invalid |
 * student_inactive | not_eligible
 */
exports.scanMealCard = async (req, res) => {
  try {
    const raw = req.body?.code ?? req.body?.qr ?? req.body?.payload;
    const now = meals.schoolNow();
    const windows = await meals.getWindowsForDate(now.date);
    const open = meals.findOpenWindow(windows, now.time);
    const reply = (result, ok, message, extra = {}) =>
      res.json({
        success: true,
        data: {
          result,
          ok,
          message,
          server_date: now.date,
          server_time: now.time,
          meal: open ? { code: open.meal_code, name: open.name, start_time: open.start_time, end_time: open.end_time } : null,
          ...extra,
        },
      });

    const code = meals.parseScanPayload(raw);
    if (!code) return reply("card_invalid", false, "This QR code is not a KASMS meal card.");

    const card = await MealCard.findOne({ where: { code } });
    if (!card) return reply("card_invalid", false, "Meal card not recognised.");

    const student = await User.findByPk(card.student_id, {
      attributes: STUDENT_ATTRS,
      include: [programmeInclude],
    });
    if (!student || student.role !== "student") {
      return reply("card_invalid", false, "Meal card is not linked to a student.");
    }
    const studentData = studentSummary(student);

    if (card.status !== "active") {
      const active = await meals.getActiveCard(student.id);
      return reply(
        "card_replaced",
        false,
        `This is an old card (#${card.version}). The student's current card is #${active?.version ?? "—"}.`,
        { student: studentData, card: { version: card.version, status: card.status } }
      );
    }

    if (!student.is_active) {
      return reply("student_inactive", false, "Student account is inactive.", { student: studentData });
    }

    const today = await meals.todayServedFlags(student.id, now.date);

    if (!open) {
      const next = meals.findNextWindow(windows, now.time);
      return reply(
        "outside_window",
        false,
        next
          ? `No meal is being served now. ${next.name} opens at ${next.start_time}.`
          : "No meal is being served now. Serving has ended for today.",
        {
          student: studentData,
          today,
          next_meal: next ? { code: next.meal_code, name: next.name, start_time: next.start_time, end_time: next.end_time } : null,
        }
      );
    }

    if (today[open.meal_code]) {
      return reply("already_served", false, `${open.name} already served today.`, {
        student: studentData,
        today,
        serving: today[open.meal_code],
      });
    }

    const feeAccess = await meals.mealFeeAccess(student.id);
    if (!feeAccess.eligible) {
      return reply("not_eligible", false, feeAccess.message || "Fee requirement for meals not met.", {
        student: studentData,
        today,
      });
    }

    let serving;
    try {
      serving = await MealServing.create({
        student_id: student.id,
        card_id: card.id,
        service_date: now.date,
        meal_code: open.meal_code,
        served_at: new Date(),
        method: "qr",
        served_by: req.user.id,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        const again = await meals.todayServedFlags(student.id, now.date);
        return reply("already_served", false, `${open.name} already served today.`, {
          student: studentData,
          today: again,
          serving: again[open.meal_code],
        });
      }
      throw err;
    }

    today[open.meal_code] = { served_at: serving.served_at, method: "qr" };
    return reply("served", true, `${open.name} served.`, {
      student: studentData,
      today,
      serving: { id: serving.id, served_at: serving.served_at, method: "qr" },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/scan/today — current meal, today's windows and counts (app header) */
exports.scanToday = async (req, res) => {
  try {
    const now = meals.schoolNow();
    const windows = await meals.getWindowsForDate(now.date);
    const open = meals.findOpenWindow(windows, now.time);
    const next = open ? null : meals.findNextWindow(windows, now.time);
    const counts = await MealServing.findAll({
      where: { service_date: now.date },
      attributes: ["meal_code", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
      group: ["meal_code"],
      raw: true,
    });
    const byMeal = Object.fromEntries(counts.map((c) => [c.meal_code, Number(c.count) || 0]));
    return res.json({
      success: true,
      data: {
        server_date: now.date,
        server_time: now.time,
        timezone: meals.SCHOOL_TZ,
        current_meal: open ? { code: open.meal_code, name: open.name, start_time: open.start_time, end_time: open.end_time } : null,
        next_meal: next ? { code: next.meal_code, name: next.name, start_time: next.start_time, end_time: next.end_time } : null,
        windows: windows.map((w) => ({ ...w, served_count: byMeal[w.meal_code] || 0 })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/students/search?q= — for manual marking (app + admin) */
exports.searchStudents = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const date = meals.normalizeDate(req.query.date) || meals.schoolNow().date;
    const like = `%${q}%`;
    const rows = await User.findAll({
      where: {
        role: "student",
        [Op.or]: [
          { full_name: { [Op.iLike]: like } },
          { admission_number: { [Op.iLike]: like } },
          { email: { [Op.iLike]: like } },
        ],
      },
      attributes: STUDENT_ATTRS,
      include: [programmeInclude],
      order: [["full_name", "ASC"]],
      limit: 15,
    });
    const ids = rows.map((r) => r.id);
    const servings = ids.length
      ? await MealServing.findAll({
          where: { student_id: ids, service_date: date },
          attributes: ["student_id", "meal_code"],
          raw: true,
        })
      : [];
    const servedBy = {};
    servings.forEach((s) => {
      servedBy[s.student_id] = servedBy[s.student_id] || { B: false, L: false, S: false };
      servedBy[s.student_id][s.meal_code] = true;
    });
    return res.json({
      success: true,
      data: rows.map((r) => ({
        ...studentSummary(r),
        served: servedBy[r.id] || { B: false, L: false, S: false },
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/**
 * POST /api/meals/servings/manual  { student_id | admission_number, meal_code, service_date?, note? }
 * Catering may only mark today; admin/staff may mark today or earlier (note required for past days).
 */
exports.markManual = async (req, res) => {
  try {
    const now = meals.schoolNow();
    const mealCode = meals.normalizeMealCode(req.body.meal_code);
    if (!mealCode) throw meals.httpError(400, "meal_code must be B, L or S");

    const serviceDate = req.body.service_date ? meals.normalizeDate(req.body.service_date) : now.date;
    if (!serviceDate) throw meals.httpError(400, "service_date must be YYYY-MM-DD");
    if (serviceDate > now.date) throw meals.httpError(400, "You cannot mark meals for a future date.");
    if (req.user.role === CATERING_ROLE && serviceDate !== now.date) {
      throw meals.httpError(403, "Catering staff can only mark today's meals.");
    }
    const note = String(req.body.note || "").trim().slice(0, 255) || null;
    if (serviceDate < now.date && !note) {
      throw meals.httpError(400, "Add a note explaining why a past meal is being marked.");
    }

    const student = await findStudentForMeals(req.body);
    if (!student.is_active) throw meals.httpError(400, "Student account is inactive.");

    if (req.user.role === CATERING_ROLE) {
      const feeAccess = await meals.mealFeeAccess(student.id);
      if (!feeAccess.eligible) {
        throw meals.httpError(403, feeAccess.message || "Fee requirement for meals not met.");
      }
    }

    let serving;
    try {
      serving = await MealServing.create({
        student_id: student.id,
        card_id: null,
        service_date: serviceDate,
        meal_code: mealCode,
        served_at: new Date(),
        method: "manual",
        served_by: req.user.id,
        note,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw meals.httpError(409, `${meals.MEAL_NAMES[mealCode]} is already recorded for this student on ${serviceDate}.`);
      }
      throw err;
    }

    await logFromRequest(req, {
      action: "create",
      resource_type: "meal_serving",
      resource_id: serving.id,
      description: `Manual ${meals.MEAL_NAMES[mealCode]} mark for ${student.full_name} on ${serviceDate}`,
      new_values: { student_id: student.id, service_date: serviceDate, meal_code: mealCode, note },
    });

    return res.status(201).json({
      success: true,
      message: `${meals.MEAL_NAMES[mealCode]} marked for ${student.full_name}.`,
      data: { serving: serving.get({ plain: true }), student: studentSummary(student) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// ── Admin: dashboard & serving log ────────────────────────────────────────

/** GET /api/meals/admin/dashboard?date= */
exports.adminDashboard = async (req, res) => {
  try {
    const now = meals.schoolNow();
    const date = meals.normalizeDate(req.query.date) || now.date;
    const windows = await meals.getWindowsForDate(date);

    const [counts, activeStudents, recent, trendRows, activeCards] = await Promise.all([
      MealServing.findAll({
        where: { service_date: date },
        attributes: ["meal_code", "method", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
        group: ["meal_code", "method"],
        raw: true,
      }),
      User.count({ where: { role: "student", is_active: true } }),
      MealServing.findAll({
        where: { service_date: date },
        include: [
          { model: User, as: "student", attributes: ["id", "full_name", "admission_number", "profile_image"] },
          { model: User, as: "server", attributes: ["id", "full_name", "role"] },
        ],
        order: [["served_at", "DESC"]],
        limit: 12,
      }),
      sequelize.query(
        `SELECT service_date::text AS date, meal_code, COUNT(*)::int AS count
           FROM meal_servings
          WHERE service_date BETWEEN (CAST(:d AS date) - INTERVAL '6 days')::date AND CAST(:d AS date)
          GROUP BY service_date, meal_code
          ORDER BY service_date`,
        { replacements: { d: date }, type: QueryTypes.SELECT }
      ),
      MealCard.count({ where: { status: "active" } }),
    ]);

    const perMeal = { B: { qr: 0, manual: 0 }, L: { qr: 0, manual: 0 }, S: { qr: 0, manual: 0 } };
    counts.forEach((c) => {
      if (perMeal[c.meal_code]) perMeal[c.meal_code][c.method] = Number(c.count) || 0;
    });

    const trend = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = { date: key, B: 0, L: 0, S: 0 };
      trendRows.filter((r) => r.date === key).forEach((r) => {
        entry[r.meal_code] = r.count;
      });
      trend.push(entry);
    }

    return res.json({
      success: true,
      data: {
        date,
        is_today: date === now.date,
        server_time: now.time,
        current_meal: date === now.date ? meals.findOpenWindow(windows, now.time)?.meal_code || null : null,
        active_students: activeStudents,
        active_cards: activeCards,
        meals: windows.map((w) => ({
          ...w,
          served_qr: perMeal[w.meal_code].qr,
          served_manual: perMeal[w.meal_code].manual,
          served_total: perMeal[w.meal_code].qr + perMeal[w.meal_code].manual,
        })),
        trend,
        recent: recent.map((r) => ({
          id: r.id,
          meal_code: r.meal_code,
          method: r.method,
          served_at: r.served_at,
          student: r.student
            ? {
                id: r.student.id,
                full_name: r.student.full_name,
                admission_number: r.student.admission_number,
                profile_image_url: profileImageUrl(r.student.profile_image),
              }
            : null,
          server: r.server ? { full_name: r.server.full_name, role: r.server.role } : null,
        })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/admin/servings?date_from&date_to&meal_code&method&search&page&limit */
exports.adminListServings = async (req, res) => {
  try {
    const { limit, page, offset } = pageParams(req.query, 15);
    const where = {};
    const from = meals.normalizeDate(req.query.date_from);
    const to = meals.normalizeDate(req.query.date_to);
    if (from && to) where.service_date = { [Op.between]: [from, to] };
    else if (from) where.service_date = { [Op.gte]: from };
    else if (to) where.service_date = { [Op.lte]: to };
    const mealCode = meals.normalizeMealCode(req.query.meal_code);
    if (mealCode) where.meal_code = mealCode;
    if (["qr", "manual"].includes(req.query.method)) where.method = req.query.method;

    const search = String(req.query.search || "").trim();
    const studentWhere = search
      ? {
          [Op.or]: [
            { full_name: { [Op.iLike]: `%${search}%` } },
            { admission_number: { [Op.iLike]: `%${search}%` } },
          ],
        }
      : undefined;

    const { rows, count } = await MealServing.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "full_name", "admission_number", "profile_image"],
          where: studentWhere,
          required: Boolean(studentWhere),
        },
        { model: User, as: "server", attributes: ["id", "full_name", "role"] },
        { model: MealCard, as: "card", attributes: ["id", "version"] },
      ],
      order: [
        ["service_date", "DESC"],
        ["served_at", "DESC"],
      ],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        service_date: r.service_date,
        meal_code: r.meal_code,
        method: r.method,
        served_at: r.served_at,
        note: r.note,
        card_version: r.card?.version || null,
        student: r.student
          ? {
              id: r.student.id,
              full_name: r.student.full_name,
              admission_number: r.student.admission_number,
              profile_image_url: profileImageUrl(r.student.profile_image),
            }
          : null,
        server: r.server ? { full_name: r.server.full_name, role: r.server.role } : null,
      })),
      pagination: { total: count, page, limit, pages: Math.max(1, Math.ceil(count / limit)) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** DELETE /api/meals/admin/servings/:id — undo a mistaken serving */
exports.adminDeleteServing = async (req, res) => {
  try {
    const serving = await MealServing.findByPk(req.params.id, {
      include: [{ model: User, as: "student", attributes: ["full_name"] }],
    });
    if (!serving) throw meals.httpError(404, "Serving record not found");
    const snapshot = serving.get({ plain: true });
    await serving.destroy();
    await logFromRequest(req, {
      action: "delete",
      resource_type: "meal_serving",
      resource_id: snapshot.id,
      description: `Removed ${meals.MEAL_NAMES[snapshot.meal_code]} record for ${snapshot.student?.full_name || "student"} on ${snapshot.service_date}`,
      old_values: snapshot,
    });
    return res.json({ success: true, message: "Serving record removed" });
  } catch (error) {
    return sendError(res, error);
  }
};

// ── Admin: meal periods & day overrides ──────────────────────────────────

/** GET /api/meals/admin/periods */
exports.adminGetPeriods = async (req, res) => {
  try {
    const periods = await meals.ensureMealPeriods();
    return res.json({ success: true, data: periods, timezone: meals.SCHOOL_TZ });
  } catch (error) {
    return sendError(res, error);
  }
};

/** PUT /api/meals/admin/periods  { periods: [{ meal_code, start_time, end_time, is_active }] } */
exports.adminUpdatePeriods = async (req, res) => {
  try {
    const input = Array.isArray(req.body?.periods) ? req.body.periods : [];
    const current = await meals.ensureMealPeriods();
    const next = current.map((p) => {
      const patch = input.find((i) => meals.normalizeMealCode(i.meal_code) === p.meal_code);
      if (!patch) return p;
      const start = meals.normalizeTime(patch.start_time);
      const end = meals.normalizeTime(patch.end_time);
      if (!start || !end) throw meals.httpError(400, `${p.name}: times must be HH:MM`);
      if (start >= end) throw meals.httpError(400, `${p.name}: start time must be before end time`);
      return {
        ...p,
        start_time: start,
        end_time: end,
        is_active: patch.is_active === undefined ? p.is_active : Boolean(patch.is_active),
      };
    });
    meals.assertNoOverlap(next);

    await sequelize.transaction(async (transaction) => {
      for (const p of next) {
        await MealPeriod.update(
          { start_time: p.start_time, end_time: p.end_time, is_active: p.is_active, updated_by: req.user.id },
          { where: { meal_code: p.meal_code }, transaction }
        );
      }
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "meal_period",
      description: "Updated default meal serving times",
      old_values: current,
      new_values: next,
    });

    return res.json({ success: true, message: "Meal times saved", data: await meals.ensureMealPeriods() });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/admin/overrides?from&to */
exports.adminListOverrides = async (req, res) => {
  try {
    const today = meals.schoolNow().date;
    const from = meals.normalizeDate(req.query.from) || today;
    const to = meals.normalizeDate(req.query.to);
    const where = { service_date: to ? { [Op.between]: [from, to] } : { [Op.gte]: from } };
    const rows = await MealPeriodOverride.findAll({
      where,
      include: [{ model: User, as: "creator", attributes: ["id", "full_name"] }],
      order: [
        ["service_date", "ASC"],
        ["meal_code", "ASC"],
      ],
      limit: 200,
    });
    const periods = await meals.ensureMealPeriods();
    const byMeal = Object.fromEntries(periods.map((p) => [p.meal_code, p]));
    return res.json({
      success: true,
      today,
      data: rows.map((r) => ({
        ...r.get({ plain: true }),
        meal_name: meals.MEAL_NAMES[r.meal_code],
        default_start: byMeal[r.meal_code]?.start_time,
        default_end: byMeal[r.meal_code]?.end_time,
        editable: r.service_date >= today,
      })),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/meals/admin/overrides  { service_date, meal_code, start_time, end_time, reason } (upsert) */
exports.adminSaveOverride = async (req, res) => {
  try {
    const today = meals.schoolNow().date;
    const serviceDate = meals.normalizeDate(req.body.service_date);
    const mealCode = meals.normalizeMealCode(req.body.meal_code);
    const start = meals.normalizeTime(req.body.start_time);
    const end = meals.normalizeTime(req.body.end_time);
    const reason = String(req.body.reason || "").trim().slice(0, 255);

    if (!serviceDate) throw meals.httpError(400, "service_date must be YYYY-MM-DD");
    if (serviceDate < today) {
      throw meals.httpError(400, "Meal times can only be changed for today or future dates. Use manual marking for past meals.");
    }
    if (!mealCode) throw meals.httpError(400, "meal_code must be B, L or S");
    if (!start || !end) throw meals.httpError(400, "Times must be HH:MM");
    if (start >= end) throw meals.httpError(400, "Start time must be before end time");
    if (!reason) throw meals.httpError(400, "Give a reason for changing the meal time");

    const windows = await meals.getWindowsForDate(serviceDate);
    meals.assertNoOverlap(
      windows.map((w) => (w.meal_code === mealCode ? { ...w, start_time: start, end_time: end } : w))
    );

    const existing = await MealPeriodOverride.findOne({ where: { service_date: serviceDate, meal_code: mealCode } });
    const oldValues = existing ? existing.get({ plain: true }) : null;
    let row;
    if (existing) {
      row = await existing.update({ start_time: start, end_time: end, reason, created_by: req.user.id });
    } else {
      row = await MealPeriodOverride.create({
        service_date: serviceDate,
        meal_code: mealCode,
        start_time: start,
        end_time: end,
        reason,
        created_by: req.user.id,
      });
    }

    await logFromRequest(req, {
      action: existing ? "update" : "create",
      resource_type: "meal_period_override",
      resource_id: row.id,
      description: `${meals.MEAL_NAMES[mealCode]} on ${serviceDate} set to ${start}–${end}: ${reason}`,
      old_values: oldValues,
      new_values: row.get({ plain: true }),
    });

    return res.status(existing ? 200 : 201).json({
      success: true,
      message: `${meals.MEAL_NAMES[mealCode]} on ${serviceDate} now runs ${start}–${end}`,
      data: row.get({ plain: true }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** DELETE /api/meals/admin/overrides/:id — back to default times (today/future only) */
exports.adminDeleteOverride = async (req, res) => {
  try {
    const row = await MealPeriodOverride.findByPk(req.params.id);
    if (!row) throw meals.httpError(404, "Override not found");
    if (row.service_date < meals.schoolNow().date) {
      throw meals.httpError(400, "Past meal time changes are kept for the record.");
    }
    const snapshot = row.get({ plain: true });
    await row.destroy();
    await logFromRequest(req, {
      action: "delete",
      resource_type: "meal_period_override",
      resource_id: snapshot.id,
      description: `${meals.MEAL_NAMES[snapshot.meal_code]} on ${snapshot.service_date} reset to default times`,
      old_values: snapshot,
    });
    return res.json({ success: true, message: "Back to default meal time" });
  } catch (error) {
    return sendError(res, error);
  }
};

// ── Admin: download limits ───────────────────────────────────────────────

/** GET /api/meals/admin/download-policy */
exports.adminGetDownloadPolicy = async (req, res) => {
  try {
    const policy = (await meals.getDownloadPolicy()).get({ plain: true });
    const today = meals.schoolNow().date;
    return res.json({
      success: true,
      data: { ...policy, today, range_active: meals.policyRangeActive(policy, today) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** PUT /api/meals/admin/download-policy  { is_enabled, max_downloads, start_date, end_date } */
exports.adminUpdateDownloadPolicy = async (req, res) => {
  try {
    const row = await meals.getDownloadPolicy();
    const old = row.get({ plain: true });
    const isEnabled = req.body.is_enabled === undefined ? old.is_enabled : Boolean(req.body.is_enabled);
    const max = req.body.max_downloads === undefined ? old.max_downloads : parseInt(req.body.max_downloads, 10);
    const start = req.body.start_date === undefined ? old.start_date : meals.normalizeDate(req.body.start_date);
    const end = req.body.end_date === undefined ? old.end_date : meals.normalizeDate(req.body.end_date);

    if (!Number.isFinite(max) || max < 1 || max > 50) {
      throw meals.httpError(400, "Downloads allowed must be between 1 and 50");
    }
    if (isEnabled) {
      if (!start || !end) throw meals.httpError(400, "Choose the start and end dates for the limit period");
      if (start > end) throw meals.httpError(400, "Start date must be on or before the end date");
    }

    await row.update({
      is_enabled: isEnabled,
      max_downloads: max,
      start_date: start || null,
      end_date: end || null,
      updated_by: req.user.id,
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "meal_download_policy",
      resource_id: row.id,
      description: isEnabled
        ? `Meal card downloads limited to ${max} between ${start} and ${end}`
        : "Meal card download limit turned off",
      old_values: old,
      new_values: row.get({ plain: true }),
    });

    const today = meals.schoolNow().date;
    const plain = row.get({ plain: true });
    return res.json({
      success: true,
      message: "Download limit saved",
      data: { ...plain, today, range_active: meals.policyRangeActive(plain, today) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/admin/downloads?search&status=all|at_limit&page&limit — per-student usage in the policy range */
exports.adminListDownloadUsage = async (req, res) => {
  try {
    const { limit, page, offset } = pageParams(req.query, 10);
    const policy = (await meals.getDownloadPolicy()).get({ plain: true });
    const hasRange = Boolean(policy.start_date && policy.end_date);
    const search = String(req.query.search || "").trim();
    const atLimitOnly = req.query.status === "at_limit" && hasRange;

    const replacements = {
      tz: meals.SCHOOL_TZ,
      rs: policy.start_date || "1970-01-01",
      re: policy.end_date || "1970-01-01",
      max: policy.max_downloads,
      search: `%${search}%`,
      limit,
      offset,
    };

    const base = `
      SELECT u.id, u.full_name, u.admission_number, u.profile_image, u.is_active,
             p.name AS programme_name,
             (SELECT COUNT(*) FROM meal_card_downloads d
                WHERE d.student_id = u.id
                  AND (d.downloaded_at AT TIME ZONE :tz)::date BETWEEN :rs AND :re)::int AS used,
             (SELECT COALESCE(SUM(g.extra_downloads), 0) FROM meal_download_grants g
                WHERE g.student_id = u.id AND g.range_start = :rs AND g.range_end = :re)::int AS extra,
             (SELECT COUNT(*) FROM meal_card_downloads d WHERE d.student_id = u.id)::int AS total_downloads,
             (SELECT MAX(d.downloaded_at) FROM meal_card_downloads d WHERE d.student_id = u.id) AS last_download,
             (SELECT MAX(c.version) FROM meal_cards c WHERE c.student_id = u.id AND c.status = 'active') AS active_version
        FROM users u
        LEFT JOIN programmes p ON p.id = u.programme_id
       WHERE u.role = 'student'
         ${search ? "AND (u.full_name ILIKE :search OR u.admission_number ILIKE :search)" : ""}
    `;
    const filtered = `SELECT * FROM (${base}) s ${atLimitOnly ? "WHERE s.used >= :max + s.extra" : ""}`;

    const [rows, [{ total }]] = await Promise.all([
      sequelize.query(`${filtered} ORDER BY s.used DESC, s.full_name ASC LIMIT :limit OFFSET :offset`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
      sequelize.query(`SELECT COUNT(*)::int AS total FROM (${filtered}) t`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
    ]);

    return res.json({
      success: true,
      policy: { ...policy, range_active: meals.policyRangeActive(policy, meals.schoolNow().date) },
      data: rows.map((r) => {
        const allowed = policy.max_downloads + (Number(r.extra) || 0);
        return {
          id: r.id,
          full_name: r.full_name,
          admission_number: r.admission_number,
          programme_name: r.programme_name,
          profile_image_url: profileImageUrl(r.profile_image),
          is_active: r.is_active,
          used: Number(r.used) || 0,
          extra: Number(r.extra) || 0,
          allowed,
          remaining: Math.max(0, allowed - (Number(r.used) || 0)),
          at_limit: hasRange && (Number(r.used) || 0) >= allowed,
          total_downloads: Number(r.total_downloads) || 0,
          last_download: r.last_download,
          active_version: r.active_version ? Number(r.active_version) : null,
        };
      }),
      pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/meals/admin/downloads/:studentId — download, grant and card history */
exports.adminStudentDownloadHistory = async (req, res) => {
  try {
    const student = await findStudentForMeals({ student_id: req.params.studentId });
    const [downloads, grants, cards] = await Promise.all([
      MealCardDownload.findAll({
        where: { student_id: student.id },
        order: [["downloaded_at", "DESC"]],
        limit: 50,
        raw: true,
      }),
      MealDownloadGrant.findAll({
        where: { student_id: student.id },
        include: [{ model: User, as: "granter", attributes: ["full_name"] }],
        order: [["created_at", "DESC"]],
        limit: 50,
      }),
      MealCard.findAll({
        where: { student_id: student.id },
        attributes: ["id", "version", "status", "issued_at", "replaced_at"],
        order: [["version", "DESC"]],
        limit: 50,
        raw: true,
      }),
    ]);
    const versionByCard = Object.fromEntries(cards.map((c) => [c.id, c.version]));
    return res.json({
      success: true,
      data: {
        student: studentSummary(student),
        allowance: await meals.downloadAllowance(student.id),
        downloads: downloads.map((d) => ({ ...d, card_version: versionByCard[d.card_id] || null })),
        grants: grants.map((g) => ({ ...g.get({ plain: true }), granted_by_name: g.granter?.full_name || null })),
        cards,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/meals/admin/downloads/grants  { student_id, extra_downloads, reason } */
exports.adminGrantDownloads = async (req, res) => {
  try {
    const policy = (await meals.getDownloadPolicy()).get({ plain: true });
    if (!policy.start_date || !policy.end_date) {
      throw meals.httpError(400, "Set the download limit period before allowing extra downloads.");
    }
    const extra = parseInt(req.body.extra_downloads, 10);
    if (!Number.isFinite(extra) || extra < 1 || extra > 10) {
      throw meals.httpError(400, "Extra downloads must be between 1 and 10");
    }
    const reason = String(req.body.reason || "").trim().slice(0, 255);
    if (!reason) throw meals.httpError(400, "Give a reason for allowing extra downloads");

    const student = await findStudentForMeals({ student_id: req.body.student_id });
    const grant = await MealDownloadGrant.create({
      student_id: student.id,
      extra_downloads: extra,
      range_start: policy.start_date,
      range_end: policy.end_date,
      reason,
      granted_by: req.user.id,
    });

    await logFromRequest(req, {
      action: "create",
      resource_type: "meal_download_grant",
      resource_id: grant.id,
      description: `Allowed ${extra} extra meal card download(s) for ${student.full_name}: ${reason}`,
      new_values: grant.get({ plain: true }),
    });

    return res.status(201).json({
      success: true,
      message: `${student.full_name} can now download ${extra} more time${extra === 1 ? "" : "s"}.`,
      data: { grant: grant.get({ plain: true }), allowance: await meals.downloadAllowance(student.id) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};