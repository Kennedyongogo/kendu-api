const { Op } = require("sequelize");
const {
  sequelize,
  ExamPeriod,
  ExamSlot,
  Programme,
  Unit,
  User,
  TimetableEntry,
} = require("../models");
const { generateExamTimetablePdf } = require("../services/examTimetablePdfService");

const STATUSES = ["draft", "pending", "approved", "rejected"];
const EDITABLE_STATUSES = ["draft", "rejected"];

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function parseDateTime(isoValue, dateValue, timeValue) {
  if (isoValue) {
    const parsed = new Date(isoValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (dateValue && timeValue) {
    const parsed = new Date(`${dateValue}T${timeValue}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function isAdmin(user) {
  return user?.role === "admin";
}

function canEditPeriod(user, period) {
  if (!user || !period) return false;
  if (!EDITABLE_STATUSES.includes(period.status)) return false;
  return isAdmin(user) || ["admin", "staff"].includes(user.role);
}

function serializePeriod(row, { includeSlots = false } = {}) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.programme_name = plain.programme?.name || null;
  plain.creator_name = plain.creator?.full_name || null;
  plain.submitter_name = plain.submitter?.full_name || null;
  plain.approver_name = plain.approver?.full_name || null;
  plain.slot_count = Array.isArray(plain.slots)
    ? plain.slots.length
    : plain.slot_count != null
      ? Number(plain.slot_count)
      : undefined;
  if (includeSlots && Array.isArray(plain.slots)) {
    plain.slots = plain.slots.map(serializeSlot);
  } else if (!includeSlots) {
    delete plain.slots;
  }
  return plain;
}

function serializeSlot(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.unit_code = plain.unit?.code || null;
  plain.unit_name = plain.unit?.name || null;
  return plain;
}

const periodIncludes = [
  { model: Programme, as: "programme", attributes: ["id", "name"] },
  { model: User, as: "creator", attributes: ["id", "full_name"] },
  { model: User, as: "submitter", attributes: ["id", "full_name"], required: false },
  { model: User, as: "approver", attributes: ["id", "full_name"], required: false },
];

const slotIncludes = [
  { model: Unit, as: "unit", attributes: ["id", "code", "name"], required: false },
];

async function loadPeriod(id, { withSlots = false } = {}) {
  return ExamPeriod.findByPk(id, {
    include: [
      ...periodIncludes,
      ...(withSlots
        ? [
            {
              model: ExamSlot,
              as: "slots",
              include: slotIncludes,
              separate: true,
              order: [["starts_at", "ASC"]],
            },
          ]
        : []),
    ],
  });
}

async function findSlotClash({
  programmeId,
  yearOfStudy,
  semester,
  startsAt,
  endsAt,
  excludeSlotId,
  transaction,
}) {
  // Overlap with other exam slots for the same cohort (any period)
  const periods = await ExamPeriod.findAll({
    where: {
      programme_id: programmeId,
      year_of_study: yearOfStudy,
      semester,
    },
    attributes: ["id"],
    transaction,
  });
  const periodIds = periods.map((p) => p.id);
  if (!periodIds.length) return null;

  const slotWhere = {
    exam_period_id: { [Op.in]: periodIds },
    starts_at: { [Op.lt]: endsAt },
    ends_at: { [Op.gt]: startsAt },
  };
  if (excludeSlotId) slotWhere.id = { [Op.ne]: excludeSlotId };

  const examClash = await ExamSlot.findOne({
    where: slotWhere,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (examClash) {
    return { kind: "exam", entry: examClash };
  }

  // Also warn/block against published class/CAT/legacy exam timetable entries
  const timetableClash = await TimetableEntry.findOne({
    where: {
      programme_id: programmeId,
      year_of_study: yearOfStudy,
      semester,
      starts_at: { [Op.lt]: endsAt },
      ends_at: { [Op.gt]: startsAt },
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (timetableClash) {
    return { kind: "timetable", entry: timetableClash };
  }

  return null;
}

function clashMessage(clash) {
  const start = new Date(clash.entry.starts_at).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (clash.kind === "exam") {
    return `This time overlaps exam "${clash.entry.title}" starting ${start} for the same programme, year and semester.`;
  }
  const label = clash.entry.category || "schedule";
  return `This time overlaps "${clash.entry.title}" (${label}) starting ${start} on the regular timetable for the same cohort.`;
}

async function validatePeriodPayload(body, { partial = false, existing = null } = {}) {
  const title = toNullableString(body.title) ?? (partial ? existing?.title : null);
  const programmeId = body.programme_id ?? (partial ? existing?.programme_id : null);
  const yearOfStudy = Number(body.year_of_study ?? (partial ? existing?.year_of_study : NaN));
  const semester = Number(body.semester ?? (partial ? existing?.semester : NaN));
  const academicYear =
    toNullableString(body.academic_year) ?? (partial ? existing?.academic_year : null);
  const periodStart =
    body.period_start !== undefined
      ? parseDateOnly(body.period_start)
      : partial
        ? existing?.period_start || null
        : parseDateOnly(body.period_start);
  const periodEnd =
    body.period_end !== undefined
      ? parseDateOnly(body.period_end)
      : partial
        ? existing?.period_end || null
        : parseDateOnly(body.period_end);
  const notes =
    body.notes !== undefined
      ? toNullableString(body.notes)
      : partial
        ? existing?.notes ?? null
        : toNullableString(body.notes);

  if (!title) return { error: "Title is required" };
  if (!programmeId) return { error: "Programme is required" };
  if (!Number.isInteger(yearOfStudy) || yearOfStudy < 1) {
    return { error: "A valid year of study is required" };
  }
  if (!Number.isInteger(semester) || semester < 1) {
    return { error: "A valid semester is required" };
  }
  if (!academicYear) return { error: "Academic year is required (e.g. 2025/2026)" };
  if (periodStart && periodEnd && periodEnd < periodStart) {
    return { error: "Period end must be on or after the start date" };
  }

  const programme = await Programme.findByPk(programmeId, { attributes: ["id", "name"] });
  if (!programme) return { error: "Programme not found" };

  return {
    values: {
      title,
      programme_id: programmeId,
      year_of_study: yearOfStudy,
      semester,
      academic_year: academicYear,
      period_start: periodStart,
      period_end: periodEnd,
      notes,
    },
  };
}

async function validateSlotPayload(body, period, { existing = null } = {}) {
  const title = toNullableString(body.title) ?? existing?.title;
  const venue =
    body.venue !== undefined ? toNullableString(body.venue) : existing?.venue ?? null;
  const unitId =
    body.unit_id !== undefined
      ? toNullableString(body.unit_id)
      : existing?.unit_id ?? null;
  const startsAt =
    parseDateTime(body.starts_at, body.start_date, body.start_time) || existing?.starts_at;
  const endsAt =
    parseDateTime(body.ends_at, body.end_date, body.end_time) || existing?.ends_at;

  if (!title) return { error: "Exam title is required" };
  if (!startsAt) return { error: "A valid start date and time is required" };
  if (!endsAt) return { error: "A valid end date and time is required" };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End must be after the start" };
  }

  if (unitId) {
    const unit = await Unit.findByPk(unitId, {
      attributes: ["id", "programme_id", "year_of_study", "semester"],
    });
    if (!unit) return { error: "Unit not found" };
    if (unit.programme_id !== period.programme_id) {
      return { error: "Unit must belong to the same programme as this exam timetable" };
    }
  }

  return {
    values: {
      title,
      venue,
      unit_id: unitId,
      starts_at: startsAt,
      ends_at: endsAt,
    },
  };
}

// ─── Periods ──────────────────────────────────────────────────────────────

exports.listPeriods = async (req, res) => {
  try {
    const where = {};
    if (req.query.programme_id) where.programme_id = req.query.programme_id;
    if (req.query.year_of_study) where.year_of_study = Number(req.query.year_of_study);
    if (req.query.semester) where.semester = Number(req.query.semester);
    if (req.query.academic_year) where.academic_year = String(req.query.academic_year).trim();
    if (req.query.status && STATUSES.includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) where.title = { [Op.iLike]: `%${q}%` };
    }

    const includeSlots =
      req.query.include_slots === "true" || req.query.include_slots === "1";

    const rows = await ExamPeriod.findAll({
      where,
      include: [
        ...periodIncludes,
        {
          model: ExamSlot,
          as: "slots",
          attributes: includeSlots
            ? ["id", "title", "venue", "starts_at", "ends_at", "unit_id"]
            : ["id"],
          include: includeSlots ? slotIncludes : undefined,
          separate: true,
          order: [["starts_at", "ASC"]],
        },
      ],
      order: [
        ["academic_year", "DESC"],
        ["programme_id", "ASC"],
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
        ["created_at", "DESC"],
      ],
    });

    return res.json({
      success: true,
      data: rows.map((row) => serializePeriod(row, { includeSlots })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

async function loadStudentApprovedPeriod(userId) {
  const student = await User.findByPk(userId, {
    attributes: ["id", "role", "programme_id", "year_of_study", "semester"],
  });
  if (!student || student.role !== "student") {
    return { error: { status: 403, message: "Students only" } };
  }
  if (!student.programme_id || !student.year_of_study || !student.semester) {
    return {
      period: null,
      message:
        "Your programme, year or semester is not set on your profile. Contact the academic office.",
    };
  }

  const row = await ExamPeriod.findOne({
    where: {
      programme_id: student.programme_id,
      year_of_study: student.year_of_study,
      semester: student.semester,
      status: "approved",
    },
    include: [
      ...periodIncludes,
      {
        model: ExamSlot,
        as: "slots",
        include: slotIncludes,
        separate: true,
        order: [["starts_at", "ASC"]],
      },
    ],
    order: [["academic_year", "DESC"]],
  });

  if (!row) {
    return {
      period: null,
      message:
        "No exam timetable has been published for your programme, year and semester yet.",
    };
  }

  return { period: row, message: null };
}

exports.getMyExamTimetable = async (req, res) => {
  try {
    const result = await loadStudentApprovedPeriod(req.userId);
    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }
    if (!result.period) {
      return res.json({ success: true, data: null, message: result.message });
    }

    return res.json({
      success: true,
      data: serializePeriod(result.period, { includeSlots: true }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadMyExamTimetablePdf = async (req, res) => {
  try {
    const result = await loadStudentApprovedPeriod(req.userId);
    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }
    if (!result.period) {
      return res.status(404).json({ success: false, message: result.message });
    }

    const period = serializePeriod(result.period, { includeSlots: true });
    const pdfBuffer = await generateExamTimetablePdf(period);

    const safeSlug =
      String(period.title || "exam-timetable")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 72) || "exam-timetable";
    const filename = `KASMS-Exam-Timetable-${safeSlug}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPeriod = async (req, res) => {
  try {
    const row = await loadPeriod(req.params.id, { withSlots: true });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    return res.json({ success: true, data: serializePeriod(row, { includeSlots: true }) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPeriod = async (req, res) => {
  try {
    const { error, values } = await validatePeriodPayload(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const duplicate = await ExamPeriod.findOne({
      where: {
        programme_id: values.programme_id,
        year_of_study: values.year_of_study,
        semester: values.semester,
        academic_year: values.academic_year,
      },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "An exam timetable already exists for this programme, year, semester and academic year.",
        data: { id: duplicate.id },
      });
    }

    const row = await ExamPeriod.create({
      ...values,
      status: "draft",
      created_by: req.userId,
    });

    const full = await loadPeriod(row.id, { withSlots: true });
    return res.status(201).json({ success: true, data: serializePeriod(full, { includeSlots: true }) });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message:
          "An exam timetable already exists for this programme, year, semester and academic year.",
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updatePeriod = async (req, res) => {
  try {
    const row = await ExamPeriod.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (!canEditPeriod(req.user, row)) {
      return res.status(403).json({
        success: false,
        message: "Only draft or rejected exam timetables can be edited",
      });
    }

    const { error, values } = await validatePeriodPayload(req.body, {
      partial: true,
      existing: row,
    });
    if (error) return res.status(400).json({ success: false, message: error });

    const duplicate = await ExamPeriod.findOne({
      where: {
        programme_id: values.programme_id,
        year_of_study: values.year_of_study,
        semester: values.semester,
        academic_year: values.academic_year,
        id: { [Op.ne]: row.id },
      },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "Another exam timetable already exists for this programme, year, semester and academic year.",
      });
    }

    const patch = { ...values };
    if (row.status === "rejected") {
      patch.status = "draft";
      patch.rejection_reason = null;
      patch.approved_by = null;
      patch.approved_at = null;
      patch.submitted_by = null;
      patch.submitted_at = null;
    }

    await row.update(patch);
    const full = await loadPeriod(row.id, { withSlots: true });
    return res.json({ success: true, data: serializePeriod(full, { includeSlots: true }) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePeriod = async (req, res) => {
  try {
    const row = await ExamPeriod.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (row.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Approved exam timetables cannot be deleted. Reject or create a new academic year plan.",
      });
    }
    if (row.status === "pending" && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only an administrator can delete a pending exam timetable",
      });
    }
    if (!EDITABLE_STATUSES.includes(row.status) && !isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Cannot delete this exam timetable" });
    }

    if (!isAdmin(req.user)) {
      const slotCount = await ExamSlot.count({ where: { exam_period_id: row.id } });
      if (slotCount > 1) {
        return res.status(403).json({
          success: false,
          message:
            "Staff can only delete exam timetables with one or no exam slots. Contact an administrator.",
        });
      }
    }

    await row.destroy();
    return res.json({ success: true, message: "Exam timetable deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitPeriod = async (req, res) => {
  try {
    const row = await loadPeriod(req.params.id, { withSlots: true });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (!EDITABLE_STATUSES.includes(row.status)) {
      return res.status(400).json({
        success: false,
        message: "Only draft or rejected exam timetables can be submitted",
      });
    }
    if (!row.slots?.length) {
      return res.status(400).json({
        success: false,
        message: "Add at least one exam slot before submitting for approval",
      });
    }

    await row.update({
      status: "pending",
      submitted_by: req.userId,
      submitted_at: new Date(),
      rejection_reason: null,
      approved_by: null,
      approved_at: null,
    });

    const full = await loadPeriod(row.id, { withSlots: true });
    return res.json({
      success: true,
      data: serializePeriod(full, { includeSlots: true }),
      message: "Exam timetable submitted for approval",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvePeriod = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Only administrators can approve" });
    }
    const row = await loadPeriod(req.params.id, { withSlots: true });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (row.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending exam timetables can be approved",
      });
    }
    if (!row.slots?.length) {
      return res.status(400).json({
        success: false,
        message: "Cannot approve an exam timetable with no slots",
      });
    }

    await row.update({
      status: "approved",
      approved_by: req.userId,
      approved_at: new Date(),
      rejection_reason: null,
    });

    const full = await loadPeriod(row.id, { withSlots: true });
    return res.json({
      success: true,
      data: serializePeriod(full, { includeSlots: true }),
      message: "Exam timetable approved",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectPeriod = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Only administrators can reject" });
    }
    const row = await ExamPeriod.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (row.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending exam timetables can be rejected",
      });
    }

    const reason = toNullableString(req.body.rejection_reason || req.body.reason);
    await row.update({
      status: "rejected",
      approved_by: req.userId,
      approved_at: new Date(),
      rejection_reason: reason,
    });

    const full = await loadPeriod(row.id, { withSlots: true });
    return res.json({
      success: true,
      data: serializePeriod(full, { includeSlots: true }),
      message: "Exam timetable rejected",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Slots ────────────────────────────────────────────────────────────────

exports.createSlot = async (req, res) => {
  try {
    const period = await ExamPeriod.findByPk(req.params.id);
    if (!period) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }
    if (!canEditPeriod(req.user, period)) {
      return res.status(403).json({
        success: false,
        message: "Slots can only be added while the exam timetable is draft or rejected",
      });
    }

    const { error, values } = await validateSlotPayload(req.body, period);
    if (error) return res.status(400).json({ success: false, message: error });

    const slot = await sequelize.transaction(async (transaction) => {
      const clash = await findSlotClash({
        programmeId: period.programme_id,
        yearOfStudy: period.year_of_study,
        semester: period.semester,
        startsAt: values.starts_at,
        endsAt: values.ends_at,
        transaction,
      });
      if (clash) {
        const conflict = new Error(clashMessage(clash));
        conflict.status = 409;
        throw conflict;
      }
      return ExamSlot.create(
        {
          ...values,
          exam_period_id: period.id,
          created_by: req.userId,
        },
        { transaction }
      );
    });

    if (period.status === "rejected") {
      await period.update({
        status: "draft",
        rejection_reason: null,
        approved_by: null,
        approved_at: null,
        submitted_by: null,
        submitted_at: null,
      });
    }

    const full = await ExamSlot.findByPk(slot.id, { include: slotIncludes });
    return res.status(201).json({ success: true, data: serializeSlot(full) });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.updateSlot = async (req, res) => {
  try {
    const slot = await ExamSlot.findByPk(req.params.slotId, {
      include: [{ model: ExamPeriod, as: "period" }],
    });
    if (!slot || !slot.period) {
      return res.status(404).json({ success: false, message: "Exam slot not found" });
    }
    if (!canEditPeriod(req.user, slot.period)) {
      return res.status(403).json({
        success: false,
        message: "Slots can only be edited while the exam timetable is draft or rejected",
      });
    }

    const { error, values } = await validateSlotPayload(req.body, slot.period, {
      existing: slot,
    });
    if (error) return res.status(400).json({ success: false, message: error });

    await sequelize.transaction(async (transaction) => {
      const clash = await findSlotClash({
        programmeId: slot.period.programme_id,
        yearOfStudy: slot.period.year_of_study,
        semester: slot.period.semester,
        startsAt: values.starts_at,
        endsAt: values.ends_at,
        excludeSlotId: slot.id,
        transaction,
      });
      if (clash) {
        const conflict = new Error(clashMessage(clash));
        conflict.status = 409;
        throw conflict;
      }
      await slot.update(values, { transaction });
    });

    if (slot.period.status === "rejected") {
      await slot.period.update({
        status: "draft",
        rejection_reason: null,
        approved_by: null,
        approved_at: null,
        submitted_by: null,
        submitted_at: null,
      });
    }

    const full = await ExamSlot.findByPk(slot.id, { include: slotIncludes });
    return res.json({ success: true, data: serializeSlot(full) });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.deleteSlot = async (req, res) => {
  try {
    const slot = await ExamSlot.findByPk(req.params.slotId, {
      include: [{ model: ExamPeriod, as: "period" }],
    });
    if (!slot || !slot.period) {
      return res.status(404).json({ success: false, message: "Exam slot not found" });
    }
    if (!canEditPeriod(req.user, slot.period)) {
      return res.status(403).json({
        success: false,
        message: "Slots can only be deleted while the exam timetable is draft or rejected",
      });
    }
    await slot.destroy();
    return res.json({ success: true, message: "Exam slot deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.downloadPeriodPdf = async (req, res) => {
  try {
    const row = await loadPeriod(req.params.id, { withSlots: true });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam timetable not found" });
    }

    const period = serializePeriod(row, { includeSlots: true });
    const pdfBuffer = await generateExamTimetablePdf(period);

    const safeSlug =
      String(period.title || "exam-timetable")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 72) || "exam-timetable";
    const filename = `KASMS-Exam-Timetable-${safeSlug}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
