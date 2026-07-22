const { Op } = require("sequelize");
const { sequelize, User, Programme } = require("../models");
const { ensureStudentCharges } = require("./accountingController");
const {
  recordAdminTransfer,
  listYearPlacementMovements,
  backfillAcademicHistories,
  placementLabel,
} = require("../utils/studentAcademicHistoryService");

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value, label) {
  const id = String(value || "").trim();
  if (!id || !uuidRe.test(id)) {
    const err = new Error(`${label} is invalid.`);
    err.status = 400;
    throw err;
  }
  return id;
}

function parseYear(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    const err = new Error("year_of_study must be an integer from 1 to 12.");
    err.status = 400;
    throw err;
  }
  return n;
}

function parseSemester(value) {
  const n = Number(value);
  if (n !== 1 && n !== 2) {
    const err = new Error("semester must be 1 or 2.");
    err.status = 400;
    throw err;
  }
  return n;
}

function mapStudent(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    full_name: plain.full_name,
    admission_number: plain.admission_number,
    email: plain.email,
    gender: plain.gender || null,
    profile_image: plain.profile_image,
    programme_id: plain.programme_id,
    year_of_study: plain.year_of_study,
    semester: plain.semester,
  };
}

function yearsForProgramme(programme) {
  const duration = Math.max(1, Number(programme.duration_years) || 1);
  return Array.from({ length: duration }, (_, i) => i + 1);
}

/** Programmes for cohort-transfer tabs. */
exports.listProgrammes = async (req, res) => {
  try {
    const rows = await Programme.findAll({
      attributes: [
        "id",
        "name",
        "duration_years",
        [
          sequelize.literal(`(
            SELECT COUNT(*)::int
            FROM users u
            WHERE u.programme_id = "Programme".id
              AND u.role = 'student'
              AND u.is_active = true
          )`),
          "student_count",
        ],
      ],
      order: [["name", "ASC"]],
    });

    return res.json({
      success: true,
      data: rows.map((row) => {
        const plain = row.get({ plain: true });
        return {
          id: plain.id,
          name: plain.name,
          duration_years: plain.duration_years || 1,
          student_count: Number(plain.student_count) || 0,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load programmes." });
  }
};

/** Years (carousel cards) for a programme with student counts. */
exports.listYears = async (req, res) => {
  try {
    const programmeId = normalizeUuid(req.params.programmeId, "programmeId");
    const programme = await Programme.findByPk(programmeId, {
      attributes: ["id", "name", "duration_years"],
    });
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found." });
    }

    const years = yearsForProgramme(programme);
    const counts = await User.findAll({
      attributes: [
        "year_of_study",
        [sequelize.fn("COUNT", sequelize.col("id")), "student_count"],
      ],
      where: {
        role: "student",
        is_active: true,
        programme_id: programmeId,
        year_of_study: { [Op.in]: years },
      },
      group: ["year_of_study"],
      raw: true,
    });

    const countMap = Object.fromEntries(
      counts.map((row) => [Number(row.year_of_study), Number(row.student_count) || 0])
    );

    const data = years.map((year) => ({
      id: `year-${year}`,
      year_of_study: year,
      name: `Year ${year}`,
      programme_id: programmeId,
      student_count: countMap[year] || 0,
      semester_count: 2,
    }));

    return res.json({
      success: true,
      data: {
        programme: {
          id: programme.id,
          name: programme.name,
          duration_years: programme.duration_years || 1,
        },
        years: data,
        total: data.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load years." });
  }
};

/** Semesters (term columns) for a year, with students. */
exports.listSemesters = async (req, res) => {
  try {
    const programmeId = normalizeUuid(req.params.programmeId, "programmeId");
    const year = parseYear(req.params.year);
    const search = String(req.query.search || "").trim();

    const programme = await Programme.findByPk(programmeId, {
      attributes: ["id", "name", "duration_years"],
    });
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found." });
    }

    const maxYear = Math.max(1, Number(programme.duration_years) || 1);
    if (year > maxYear) {
      return res.status(400).json({
        success: false,
        message: `This programme only has ${maxYear} year(s) of study.`,
      });
    }

    const baseWhere = {
      role: "student",
      is_active: true,
      programme_id: programmeId,
      year_of_study: year,
      semester: { [Op.in]: [1, 2] },
    };

    let studentWhere = baseWhere;
    if (search) {
      const pattern = `%${search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      const ilike = { [Op.iLike]: pattern };
      studentWhere = {
        [Op.and]: [
          baseWhere,
          {
            [Op.or]: [
              { full_name: ilike },
              { admission_number: ilike },
              { email: ilike },
            ],
          },
        ],
      };
    }

    const students = await User.findAll({
      where: studentWhere,
      attributes: [
        "id",
        "full_name",
        "admission_number",
        "email",
        "profile_image",
        "programme_id",
        "year_of_study",
        "semester",
      ],
      order: [
        ["admission_number", "ASC"],
        ["full_name", "ASC"],
      ],
      limit: 2000,
    });

    const bySem = { 1: [], 2: [] };
    for (const row of students) {
      const mapped = mapStudent(row);
      if (bySem[mapped.semester]) bySem[mapped.semester].push(mapped);
    }

    const semesters = [1, 2].map((sem) => ({
      id: `sem-${year}-${sem}`,
      semester: sem,
      name: `Semester ${sem}`,
      year_of_study: year,
      programme_id: programmeId,
      student_count: bySem[sem].length,
      students: bySem[sem],
    }));

    return res.json({
      success: true,
      data: {
        programme: { id: programme.id, name: programme.name },
        year_of_study: year,
        semesters,
        total: semesters.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load semesters." });
  }
};

async function loadTargetProgramme(programmeId, year, semester, transaction) {
  const programme = await Programme.findByPk(programmeId, {
    attributes: ["id", "name", "duration_years"],
    transaction,
  });
  if (!programme) {
    const err = new Error("Target programme not found.");
    err.status = 404;
    throw err;
  }
  const maxYear = Math.max(1, Number(programme.duration_years) || 1);
  if (year > maxYear) {
    const err = new Error(`Year ${year} is outside this programme (max Year ${maxYear}).`);
    err.status = 400;
    throw err;
  }
  return programme;
}

async function moveStudentPlacement(studentId, targetProgrammeId, targetYear, targetSemester, transaction, actorUserId) {
  const student = await User.findByPk(studentId, {
    attributes: [
      "id",
      "role",
      "full_name",
      "admission_number",
      "email",
      "profile_image",
      "programme_id",
      "year_of_study",
      "semester",
      "is_active",
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!student || student.role !== "student") {
    const err = new Error(`Student not found: ${studentId}`);
    err.status = 404;
    throw err;
  }

  const same =
    String(student.programme_id) === String(targetProgrammeId) &&
    Number(student.year_of_study) === Number(targetYear) &&
    Number(student.semester) === Number(targetSemester);

  if (same) {
    return { student: mapStudent(student), unchanged: true };
  }

  await recordAdminTransfer(student, {
    programmeId: targetProgrammeId,
    yearOfStudy: targetYear,
    semester: targetSemester,
    actorUserId: actorUserId || null,
    transaction,
  });

  await student.update(
    {
      programme_id: targetProgrammeId,
      year_of_study: targetYear,
      semester: targetSemester,
    },
    { transaction }
  );

  await ensureStudentCharges(student, transaction);

  const refreshed = await User.findByPk(studentId, {
    attributes: [
      "id",
      "full_name",
      "admission_number",
      "email",
      "profile_image",
      "programme_id",
      "year_of_study",
      "semester",
    ],
    transaction,
  });

  return { student: mapStudent(refreshed), unchanged: false };
}

/** Move one student to another year and/or semester (same or different programme). */
exports.moveStudent = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const studentId = normalizeUuid(req.params.studentId, "studentId");
    const targetProgrammeId = normalizeUuid(req.body?.programme_id, "programme_id");
    const targetYear = parseYear(req.body?.year_of_study);
    const targetSemester = parseSemester(req.body?.semester);

    const programme = await loadTargetProgramme(targetProgrammeId, targetYear, targetSemester, t);
    const result = await moveStudentPlacement(
      studentId,
      targetProgrammeId,
      targetYear,
      targetSemester,
      t,
      req.userId
    );

    await t.commit();

    if (result.unchanged) {
      return res.json({
        success: true,
        message: "Student is already in that semester.",
        data: { student: result.student, unchanged: true },
      });
    }

    const label = placementLabel(programme, targetYear, targetSemester);
    return res.json({
      success: true,
      message: `Moved to ${label}.`,
      data: {
        student: result.student,
        placement: {
          programme_id: targetProgrammeId,
          year_of_study: targetYear,
          semester: targetSemester,
        },
        programme: { id: programme.id, name: programme.name },
      },
    });
  } catch (error) {
    await t.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not move student." });
  }
};

/** Move many students to the same year/semester. */
exports.moveStudentsBulk = async (req, res) => {
  const rawIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  const studentIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];

  if (!studentIds.length) {
    return res.status(400).json({ success: false, message: "student_ids is required." });
  }
  if (studentIds.length > 200) {
    return res.status(400).json({ success: false, message: "Too many students in one request (max 200)." });
  }

  const t = await sequelize.transaction();
  try {
    const targetProgrammeId = normalizeUuid(req.body?.programme_id, "programme_id");
    const targetYear = parseYear(req.body?.year_of_study);
    const targetSemester = parseSemester(req.body?.semester);
    const programme = await loadTargetProgramme(targetProgrammeId, targetYear, targetSemester, t);

    const results = [];
    for (const rawId of studentIds) {
      const studentId = normalizeUuid(rawId, "student_id");
      const result = await moveStudentPlacement(
        studentId,
        targetProgrammeId,
        targetYear,
        targetSemester,
        t,
        req.userId
      );
      results.push({ student_id: studentId, ...result });
    }

    await t.commit();

    const moved = results.filter((r) => !r.unchanged).length;
    const skipped = results.length - moved;
    const label = placementLabel(programme, targetYear, targetSemester);

    return res.json({
      success: true,
      message:
        moved === 0
          ? "All selected students are already in that semester."
          : `Moved ${moved} student${moved === 1 ? "" : "s"} to ${label}.${skipped ? ` ${skipped} already there.` : ""}`,
      data: {
        moved,
        skipped,
        results,
        programme: { id: programme.id, name: programme.name },
        year_of_study: targetYear,
        semester: targetSemester,
      },
    });
  } catch (error) {
    await t.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not move students." });
  }
};

/** Placement register for a programme year. */
exports.listRegister = async (req, res) => {
  try {
    const programmeId = normalizeUuid(req.params.programmeId, "programmeId");
    const year = parseYear(req.params.year);
    const semester =
      req.query.semester != null && String(req.query.semester).trim() !== ""
        ? parseSemester(req.query.semester)
        : undefined;
    const search = req.query.search != null ? String(req.query.search).trim() : "";

    const data = await listYearPlacementMovements({
      programmeId,
      yearOfStudy: year,
      semester,
      search: search || undefined,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load register." });
  }
};

/** Backfill admission history for students with no rows yet. */
exports.backfillRegister = async (req, res) => {
  try {
    const result = await backfillAcademicHistories({ actorUserId: req.userId });
    return res.json({
      success: true,
      message: `Backfill complete. Created ${result.created} admission record(s); skipped ${result.skipped} student(s) who already had history.`,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Backfill failed." });
  }
};
