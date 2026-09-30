const { Op, QueryTypes } = require("sequelize");
const {
  sequelize,
  User,
  Programme,
  AttendanceSession,
  AttendanceRecord,
} = require("../models");
const { httpError, schoolNow, normalizeDate, normalizeTime } = require("../services/mealService");
const { generateAttendancePdf } = require("../services/attendancePdfService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendError(res, error) {
  const status = error.status || 500;
  return res.status(status).json({ success: false, message: error.message || "Something went wrong" });
}

function profileImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) return filename;
  return `/uploads/profiles/${filename}`;
}

function parseCohort(source) {
  const programmeId = String(source.programme_id ?? "").trim();
  const year = Number.parseInt(source.year_of_study, 10);
  const semester = Number.parseInt(source.semester, 10);
  if (!UUID_RE.test(programmeId)) throw httpError(400, "Choose a programme.");
  if (!Number.isInteger(year) || year < 1 || year > 10) throw httpError(400, "Choose a valid year of study.");
  if (!Number.isInteger(semester) || semester < 1 || semester > 3) throw httpError(400, "Choose a valid semester.");
  return { programmeId, year, semester };
}

function optionalText(value, maxLen) {
  if (value === undefined) return undefined;
  const s = String(value ?? "").trim();
  return s ? s.slice(0, maxLen) : null;
}

function parsePresentIds(value) {
  if (!Array.isArray(value)) throw httpError(400, "present_student_ids must be a list.");
  return new Set(value.map((v) => String(v)));
}

async function loadRoster({ programmeId, year, semester }, transaction) {
  return User.findAll({
    attributes: ["id", "full_name", "admission_number", "profile_image"],
    where: {
      role: "student",
      is_active: true,
      programme_id: programmeId,
      year_of_study: year,
      semester,
    },
    order: [
      ["full_name", "ASC"],
      ["admission_number", "ASC"],
    ],
    transaction,
  });
}

function canAccess(session, user) {
  return session.taken_by === user.id || user.role === "admin";
}

async function findSessionForUser(id, user, { withRecords = false, transaction } = {}) {
  if (!UUID_RE.test(String(id))) throw httpError(404, "Register not found.");
  const include = [{ model: User, as: "teacher", attributes: ["id", "full_name"], required: false }];
  if (withRecords) {
    include.push({
      model: AttendanceRecord,
      as: "records",
      required: false,
      include: [{ model: User, as: "student", attributes: ["id", "profile_image"], required: false }],
    });
  }
  const session = await AttendanceSession.findByPk(id, { include, transaction });
  if (!session || !canAccess(session, user)) throw httpError(404, "Register not found.");
  return session;
}

function serializeSession(session) {
  const s = session.get({ plain: true });
  const out = {
    id: s.id,
    programme_id: s.programme_id,
    programme_name: s.programme_name,
    year_of_study: s.year_of_study,
    semester: s.semester,
    session_date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    unit_name: s.unit_name,
    notes: s.notes,
    present_count: s.present_count,
    absent_count: s.absent_count,
    total_count: s.total_count,
    taken_by: s.teacher ? { id: s.teacher.id, full_name: s.teacher.full_name } : { id: s.taken_by, full_name: null },
    created_at: s.created_at ?? s.createdAt,
    updated_at: s.updated_at ?? s.updatedAt,
  };
  if (Array.isArray(s.records)) {
    out.records = s.records
      .map((r) => ({
        id: r.id,
        student_id: r.student_id,
        full_name: r.student_name,
        admission_number: r.admission_number,
        status: r.status,
        profile_image_url: profileImageUrl(r.student?.profile_image),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }
  return out;
}

function parseSessionFields(body, { partial = false } = {}) {
  const fields = {};
  const now = schoolNow();

  if (body.session_date !== undefined || !partial) {
    const date = body.session_date === undefined ? now.date : normalizeDate(body.session_date);
    if (!date) throw httpError(400, "Date must be in YYYY-MM-DD format.");
    if (date > now.date) throw httpError(400, "Attendance cannot be recorded for a future date.");
    fields.session_date = date;
  }
  if (body.start_time !== undefined || !partial) {
    const start = body.start_time === undefined ? now.time : normalizeTime(body.start_time);
    if (!start) throw httpError(400, "Start time must be in HH:MM format.");
    fields.start_time = start;
  }
  if (body.end_time !== undefined) {
    if (body.end_time === null || body.end_time === "") {
      fields.end_time = null;
    } else {
      const end = normalizeTime(body.end_time);
      if (!end) throw httpError(400, "End time must be in HH:MM format.");
      fields.end_time = end;
    }
  }
  const unit = optionalText(body.unit_name, 150);
  if (unit !== undefined) fields.unit_name = unit;
  const notes = optionalText(body.notes, 2000);
  if (notes !== undefined) fields.notes = notes;
  return fields;
}

/** Programmes with active students, each with the year/semester cohorts that have students. */
exports.listClasses = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT u.programme_id, p.name AS programme_name, u.year_of_study, u.semester,
              COUNT(*)::int AS student_count
         FROM users u
         JOIN programmes p ON p.id = u.programme_id
        WHERE u.role = 'student'
          AND u.is_active = true
          AND u.year_of_study IS NOT NULL
          AND u.semester IS NOT NULL
        GROUP BY u.programme_id, p.name, u.year_of_study, u.semester
        ORDER BY p.name ASC, u.year_of_study ASC, u.semester ASC`,
      { type: QueryTypes.SELECT }
    );

    const byProgramme = new Map();
    for (const row of rows) {
      if (!byProgramme.has(row.programme_id)) {
        byProgramme.set(row.programme_id, {
          id: row.programme_id,
          name: row.programme_name,
          student_count: 0,
          cohorts: [],
        });
      }
      const programme = byProgramme.get(row.programme_id);
      const count = Number(row.student_count) || 0;
      programme.student_count += count;
      programme.cohorts.push({
        year_of_study: Number(row.year_of_study),
        semester: Number(row.semester),
        student_count: count,
      });
    }
    const programmes = [...byProgramme.values()];

    return res.json({
      success: true,
      data: {
        total_students: programmes.reduce((sum, p) => sum + p.student_count, 0),
        programmes,
        today: schoolNow(),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/** Active students in one programme cohort, for filling a new register. */
exports.getRoster = async (req, res) => {
  try {
    const cohort = parseCohort(req.query);
    const programme = await Programme.findByPk(cohort.programmeId, { attributes: ["id", "name"] });
    if (!programme) throw httpError(404, "Programme not found.");
    const students = await loadRoster(cohort);

    return res.json({
      success: true,
      data: {
        programme: { id: programme.id, name: programme.name },
        year_of_study: cohort.year,
        semester: cohort.semester,
        today: schoolNow(),
        students: students.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          profile_image_url: profileImageUrl(s.profile_image),
        })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.createSession = async (req, res) => {
  try {
    const cohort = parseCohort(req.body);
    const fields = parseSessionFields(req.body);
    const presentIds = parsePresentIds(req.body.present_student_ids ?? []);

    const created = await sequelize.transaction(async (transaction) => {
      const programme = await Programme.findByPk(cohort.programmeId, { attributes: ["id", "name"], transaction });
      if (!programme) throw httpError(404, "Programme not found.");

      const roster = await loadRoster(cohort, transaction);
      if (!roster.length) throw httpError(400, "There are no active students in this class.");
      const rosterIds = new Set(roster.map((s) => s.id));
      const stray = [...presentIds].filter((id) => !rosterIds.has(id));
      if (stray.length) throw httpError(400, "Some selected students are not in this class. Refresh and try again.");

      const presentCount = roster.filter((s) => presentIds.has(s.id)).length;
      const session = await AttendanceSession.create(
        {
          ...fields,
          taken_by: req.user.id,
          programme_id: programme.id,
          programme_name: programme.name,
          year_of_study: cohort.year,
          semester: cohort.semester,
          present_count: presentCount,
          absent_count: roster.length - presentCount,
          total_count: roster.length,
        },
        { transaction }
      );

      await AttendanceRecord.bulkCreate(
        roster.map((s) => ({
          session_id: session.id,
          student_id: s.id,
          status: presentIds.has(s.id) ? "present" : "absent",
          student_name: s.full_name,
          admission_number: s.admission_number,
        })),
        { transaction }
      );

      return session.id;
    });

    const session = await findSessionForUser(created, req.user, { withRecords: true });
    return res.status(201).json({ success: true, message: "Attendance saved.", data: serializeSession(session) });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listSessions = async (req, res) => {
  try {
    const scopeAll = req.query.scope === "all" && req.user.role === "admin";
    const where = scopeAll ? {} : { taken_by: req.user.id };

    if (req.query.programme_id) {
      if (!UUID_RE.test(String(req.query.programme_id))) throw httpError(400, "Invalid programme.");
      where.programme_id = req.query.programme_id;
    }
    const from = req.query.from ? normalizeDate(req.query.from) : null;
    const to = req.query.to ? normalizeDate(req.query.to) : null;
    if ((req.query.from && !from) || (req.query.to && !to)) throw httpError(400, "Dates must be YYYY-MM-DD.");
    if (from || to) {
      where.session_date = {
        ...(from ? { [Op.gte]: from } : {}),
        ...(to ? { [Op.lte]: to } : {}),
      };
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const { count, rows } = await AttendanceSession.findAndCountAll({
      where,
      include: [{ model: User, as: "teacher", attributes: ["id", "full_name"], required: false }],
      order: [
        ["session_date", "DESC"],
        ["start_time", "DESC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    });

    const today = schoolNow().date;
    const monthStart = `${today.slice(0, 7)}-01`;
    const summaryWhere = scopeAll ? {} : { taken_by: req.user.id };
    const [totals] = await AttendanceSession.findAll({
      where: summaryWhere,
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "registers"],
        [sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("present_count")), 0), "present"],
        [sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("total_count")), 0), "marked"],
      ],
      raw: true,
    });
    const thisMonth = await AttendanceSession.count({
      where: { ...summaryWhere, session_date: { [Op.gte]: monthStart } },
    });
    const marked = Number(totals?.marked) || 0;

    return res.json({
      success: true,
      data: {
        scope: scopeAll ? "all" : "mine",
        total: count,
        limit,
        offset,
        summary: {
          registers: Number(totals?.registers) || 0,
          this_month: thisMonth,
          attendance_rate: marked ? Math.round(((Number(totals?.present) || 0) / marked) * 1000) / 10 : null,
        },
        sessions: rows.map(serializeSession),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getSession = async (req, res) => {
  try {
    const session = await findSessionForUser(req.params.id, req.user, { withRecords: true });
    return res.json({ success: true, data: serializeSession(session) });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.updateSession = async (req, res) => {
  try {
    const fields = parseSessionFields(req.body, { partial: true });
    const presentIds =
      req.body.present_student_ids === undefined ? null : parsePresentIds(req.body.present_student_ids);

    await sequelize.transaction(async (transaction) => {
      const session = await findSessionForUser(req.params.id, req.user, { transaction });

      if (presentIds) {
        const records = await AttendanceRecord.findAll({ where: { session_id: session.id }, transaction });
        const known = new Set(records.map((r) => r.student_id));
        if ([...presentIds].some((id) => !known.has(id))) {
          throw httpError(400, "Some selected students are not on this register.");
        }
        const toPresent = records.filter((r) => presentIds.has(r.student_id) && r.status !== "present");
        const toAbsent = records.filter((r) => !presentIds.has(r.student_id) && r.status !== "absent");
        if (toPresent.length) {
          await AttendanceRecord.update(
            { status: "present" },
            { where: { id: toPresent.map((r) => r.id) }, transaction }
          );
        }
        if (toAbsent.length) {
          await AttendanceRecord.update(
            { status: "absent" },
            { where: { id: toAbsent.map((r) => r.id) }, transaction }
          );
        }
        const presentCount = records.filter((r) => presentIds.has(r.student_id)).length;
        fields.present_count = presentCount;
        fields.absent_count = records.length - presentCount;
        fields.total_count = records.length;
      }

      if (Object.keys(fields).length) await session.update(fields, { transaction });
    });

    const session = await findSessionForUser(req.params.id, req.user, { withRecords: true });
    return res.json({ success: true, message: "Attendance updated.", data: serializeSession(session) });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.deleteSession = async (req, res) => {
  try {
    await sequelize.transaction(async (transaction) => {
      const session = await findSessionForUser(req.params.id, req.user, { transaction });
      await AttendanceRecord.destroy({ where: { session_id: session.id }, transaction });
      await session.destroy({ transaction });
    });
    return res.json({ success: true, message: "Register deleted.", data: { id: req.params.id } });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.downloadSessionPdf = async (req, res) => {
  try {
    const session = await findSessionForUser(req.params.id, req.user, { withRecords: true });
    const payload = serializeSession(session);
    const pdfBuffer = await generateAttendancePdf(payload);

    const slug =
      String(payload.programme_name || "class")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 48) || "class";
    const filename = `KASMS-Attendance-${slug}-Y${payload.year_of_study}S${payload.semester}-${payload.session_date}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return sendError(res, error);
  }
};
