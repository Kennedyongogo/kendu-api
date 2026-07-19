const { Op } = require("sequelize");
const { sequelize, TimetableEntry, Programme, User } = require("../models");

const CATEGORIES = ["class", "cat", "exam"];

const CATEGORY_LABELS = {
  class: "class session",
  cat: "CAT",
  exam: "exam",
};

/**
 * Accepts either a full ISO datetime (starts_at / ends_at) or a
 * separate date + time pair (start_date "YYYY-MM-DD" + start_time "HH:mm").
 */
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

function serializeEntry(entry) {
  const plain = entry.get ? entry.get({ plain: true }) : entry;
  return {
    ...plain,
    programme_name: plain.programme?.name || null,
  };
}

/**
 * A schedule clashes when the same programme + year + semester cohort already
 * has any entry (class, CAT or exam) overlapping the requested window.
 */
async function findClash({ programmeId, yearOfStudy, semester, startsAt, endsAt, excludeId, transaction }) {
  const where = {
    programme_id: programmeId,
    year_of_study: yearOfStudy,
    semester,
    starts_at: { [Op.lt]: endsAt },
    ends_at: { [Op.gt]: startsAt },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return TimetableEntry.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

function clashMessage(clash) {
  const label = CATEGORY_LABELS[clash.category] || "schedule";
  const start = new Date(clash.starts_at).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `This time overlaps "${clash.title}" (${label}) starting ${start} for the same programme, year and semester.`;
}

async function validatePayload(body) {
  const title = String(body.title || body.name || "").trim();
  const programmeId = body.programme_id;
  const yearOfStudy = Number(body.year_of_study);
  const semester = Number(body.semester);
  const category = String(body.category || "").toLowerCase();
  const startsAt = parseDateTime(body.starts_at, body.start_date, body.start_time);
  const endsAt = parseDateTime(body.ends_at, body.end_date, body.end_time);

  if (!title) return { error: "Title is required" };
  if (!programmeId) return { error: "Programme is required" };
  if (!Number.isInteger(yearOfStudy) || yearOfStudy < 1) {
    return { error: "A valid year of study is required" };
  }
  if (!Number.isInteger(semester) || semester < 1) {
    return { error: "A valid semester is required" };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: "Category must be one of: class, cat, exam" };
  }
  if (!startsAt) return { error: "A valid start date and time is required" };
  if (!endsAt) return { error: "A valid end date and time is required" };
  if (endsAt <= startsAt) return { error: "End must be after the start" };

  const programme = await Programme.findByPk(programmeId, { attributes: ["id", "name"] });
  if (!programme) return { error: "Programme not found" };

  return {
    values: {
      title,
      programme_id: programmeId,
      year_of_study: yearOfStudy,
      semester,
      category,
      starts_at: startsAt,
      ends_at: endsAt,
    },
  };
}

function rangeFilter(query) {
  const filters = {};
  const year = Number(query.year);
  if (Number.isInteger(year) && year > 1970) {
    const month = Number(query.month);
    const hasMonth = Number.isInteger(month) && month >= 0 && month <= 11;
    const from = new Date(year, hasMonth ? month : 0, 1);
    const to = new Date(hasMonth ? year : year + 1, hasMonth ? month + 1 : 0, 1);
    // Anything overlapping the window, not just entries starting inside it.
    filters.starts_at = { [Op.lt]: to };
    filters.ends_at = { [Op.gt]: from };
  }
  if (query.category && CATEGORIES.includes(String(query.category).toLowerCase())) {
    filters.category = String(query.category).toLowerCase();
  }
  return filters;
}

// ─── Admin ────────────────────────────────────────────────────────────────

exports.listEntries = async (req, res) => {
  try {
    const where = rangeFilter(req.query);
    if (req.query.programme_id) where.programme_id = req.query.programme_id;
    if (req.query.year_of_study) where.year_of_study = Number(req.query.year_of_study);
    if (req.query.semester) where.semester = Number(req.query.semester);

    const entries = await TimetableEntry.findAll({
      where,
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
      order: [["starts_at", "ASC"]],
    });
    return res.json({ success: true, data: entries.map(serializeEntry) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEntry = async (req, res) => {
  try {
    const entry = await TimetableEntry.findByPk(req.params.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Timetable entry not found" });
    }
    return res.json({ success: true, data: serializeEntry(entry) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEntry = async (req, res) => {
  try {
    const { error, values } = await validatePayload(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const entry = await sequelize.transaction(async (transaction) => {
      const clash = await findClash({
        programmeId: values.programme_id,
        yearOfStudy: values.year_of_study,
        semester: values.semester,
        startsAt: values.starts_at,
        endsAt: values.ends_at,
        transaction,
      });
      if (clash) {
        const conflict = new Error(clashMessage(clash));
        conflict.status = 409;
        throw conflict;
      }
      return TimetableEntry.create({ ...values, created_by: req.userId }, { transaction });
    });

    const created = await TimetableEntry.findByPk(entry.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });
    return res.status(201).json({ success: true, data: serializeEntry(created) });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.updateEntry = async (req, res) => {
  try {
    const existing = await TimetableEntry.findByPk(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Timetable entry not found" });
    }

    // Missing fields fall back to the stored values so partial updates work.
    const merged = {
      title: req.body.title ?? req.body.name ?? existing.title,
      programme_id: req.body.programme_id ?? existing.programme_id,
      year_of_study: req.body.year_of_study ?? existing.year_of_study,
      semester: req.body.semester ?? existing.semester,
      category: req.body.category ?? existing.category,
      starts_at:
        parseDateTime(req.body.starts_at, req.body.start_date, req.body.start_time) ||
        existing.starts_at,
      ends_at:
        parseDateTime(req.body.ends_at, req.body.end_date, req.body.end_time) ||
        existing.ends_at,
    };
    const { error, values } = await validatePayload(merged);
    if (error) return res.status(400).json({ success: false, message: error });

    await sequelize.transaction(async (transaction) => {
      const clash = await findClash({
        programmeId: values.programme_id,
        yearOfStudy: values.year_of_study,
        semester: values.semester,
        startsAt: values.starts_at,
        endsAt: values.ends_at,
        excludeId: existing.id,
        transaction,
      });
      if (clash) {
        const conflict = new Error(clashMessage(clash));
        conflict.status = 409;
        throw conflict;
      }
      await existing.update(values, { transaction });
    });

    const updated = await TimetableEntry.findByPk(existing.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });
    return res.json({ success: true, data: serializeEntry(updated) });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const entry = await TimetableEntry.findByPk(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: "Timetable entry not found" });
    }
    await entry.destroy();
    return res.json({ success: true, message: "Timetable entry deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Student portal ───────────────────────────────────────────────────────

exports.getMyTimetable = async (req, res) => {
  try {
    const student = await User.findByPk(req.userId, {
      attributes: ["id", "role", "programme_id", "year_of_study", "semester"],
    });
    if (!student || student.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }
    if (!student.programme_id || !student.year_of_study || !student.semester) {
      return res.json({ success: true, data: [] });
    }

    const where = {
      ...rangeFilter(req.query),
      programme_id: student.programme_id,
      year_of_study: student.year_of_study,
      semester: student.semester,
    };
    const entries = await TimetableEntry.findAll({
      where,
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
      order: [["starts_at", "ASC"]],
    });
    return res.json({ success: true, data: entries.map(serializeEntry) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
