const { sequelize, User, Programme, Department, Unit, StudentUnitRegistration, StudentTranscript, StudentTranscriptLine } = require("../models");
const { buildTranscriptPdfBuffer } = require("../services/transcriptPdfService");

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_GRADES = new Set(["A", "B", "C", "D", "E", "#"]);

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

function normalizeGrade(value) {
  const g = String(value || "").trim().toUpperCase();
  if (!ALLOWED_GRADES.has(g)) {
    const err = new Error("grade must be one of A, B, C, D, E, or # (audited).");
    err.status = 400;
    throw err;
  }
  return g;
}

function normalizeAcademicYear(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}\/\d{4}$/.test(s)) {
    const err = new Error('academic_year must look like "2025/2026".');
    err.status = 400;
    throw err;
  }
  return s;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadStudent(studentId) {
  const student = await User.findOne({
    where: { id: studentId, role: "student" },
    attributes: [
      "id",
      "full_name",
      "admission_number",
      "email",
      "programme_id",
      "year_of_study",
      "semester",
      "profile_image",
      "created_at",
    ],
    include: [
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name", "category", "award"],
        include: [
          {
            model: Department,
            as: "departments",
            attributes: ["id", "name", "code"],
            through: { attributes: [] },
          },
        ],
      },
    ],
  });
  if (!student) throw httpError(404, "Student not found.");
  return student;
}

async function loadTranscript(id, { forUpdate = false } = {}) {
  const transcript = await StudentTranscript.findByPk(id, {
    include: [
      {
        model: StudentTranscriptLine,
        as: "lines",
        separate: true,
        order: [
          ["sort_order", "ASC"],
          ["unit_code", "ASC"],
        ],
      },
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name", "category", "award"],
        include: [
          {
            model: Department,
            as: "departments",
            attributes: ["id", "name", "code"],
            through: { attributes: [] },
          },
        ],
      },
      {
        model: User,
        as: "student",
        attributes: [
          "id",
          "full_name",
          "admission_number",
          "email",
          "programme_id",
          "year_of_study",
          "semester",
          "profile_image",
          "created_at",
        ],
      },
    ],
    ...(forUpdate ? { lock: false } : {}),
  });
  if (!transcript) throw httpError(404, "Transcript not found.");
  return transcript;
}

function mapLineInput(raw, index) {
  const unit_code = String(raw.unit_code || "").trim();
  const course_title = String(raw.course_title || "").trim();
  if (!unit_code || !course_title) {
    throw httpError(400, `Line ${index + 1}: unit_code and course_title are required.`);
  }
  const hours = Number(raw.hours);
  if (!Number.isFinite(hours) || hours < 0) {
    throw httpError(400, `Line ${index + 1}: hours must be a non-negative number.`);
  }
  return {
    unit_id: raw.unit_id ? normalizeUuid(raw.unit_id, "unit_id") : null,
    registration_id: raw.registration_id
      ? normalizeUuid(raw.registration_id, "registration_id")
      : null,
    unit_code,
    course_title,
    hours,
    grade: normalizeGrade(raw.grade),
    sort_order: Number.isInteger(Number(raw.sort_order)) ? Number(raw.sort_order) : index,
  };
}

function mapTranscriptResponse(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    student_id: plain.student_id,
    programme_id: plain.programme_id,
    year_of_study: plain.year_of_study,
    semester: plain.semester,
    academic_year: plain.academic_year,
    school_label: plain.school_label,
    date_of_admission: plain.date_of_admission,
    date_of_graduation: plain.date_of_graduation,
    recommendation: plain.recommendation,
    status: plain.status,
    issued_at: plain.issued_at,
    issued_by: plain.issued_by,
    created_by: plain.created_by,
    notes: plain.notes,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    lines: (plain.lines || []).map((l) => ({
      id: l.id,
      unit_id: l.unit_id,
      registration_id: l.registration_id,
      unit_code: l.unit_code,
      course_title: l.course_title,
      hours: Number(l.hours),
      grade: l.grade,
      sort_order: l.sort_order,
    })),
    student: plain.student || null,
    programme: plain.programme || null,
  };
}

function defaultSchoolLabel(student) {
  const deps = student.programme?.departments || [];
  return deps[0]?.name || null;
}

function defaultAdmissionDate(student) {
  if (!student.created_at) return null;
  const d = new Date(student.created_at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** GET /api/transcripts/students/:studentId/context */
exports.getStudentContext = async (req, res) => {
  try {
    const studentId = normalizeUuid(req.params.studentId, "studentId");
    const student = await loadStudent(studentId);
    const plain = student.get({ plain: true });
    return res.json({
      success: true,
      data: {
        student: {
          id: plain.id,
          full_name: plain.full_name,
          admission_number: plain.admission_number,
          email: plain.email,
          programme_id: plain.programme_id,
          year_of_study: plain.year_of_study,
          semester: plain.semester,
          profile_image: plain.profile_image,
          created_at: plain.created_at,
        },
        programme: plain.programme || null,
        defaults: {
          school_label: defaultSchoolLabel(plain),
          date_of_admission: defaultAdmissionDate(plain),
          year_of_study: plain.year_of_study,
          semester: plain.semester,
          programme_id: plain.programme_id,
        },
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/transcripts/students/:studentId */
exports.listForStudent = async (req, res) => {
  try {
    const studentId = normalizeUuid(req.params.studentId, "studentId");
    await loadStudent(studentId);
    const rows = await StudentTranscript.findAll({
      where: { student_id: studentId },
      include: [
        {
          model: StudentTranscriptLine,
          as: "lines",
          attributes: ["id"],
        },
        {
          model: Programme,
          as: "programme",
          attributes: ["id", "name"],
        },
      ],
      order: [
        ["academic_year", "DESC"],
        ["year_of_study", "DESC"],
        ["semester", "DESC"],
        ["created_at", "DESC"],
      ],
    });

    return res.json({
      success: true,
      data: rows.map((row) => {
        const plain = row.get({ plain: true });
        return {
          id: plain.id,
          programme_id: plain.programme_id,
          programme_name: plain.programme?.name || null,
          year_of_study: plain.year_of_study,
          semester: plain.semester,
          academic_year: plain.academic_year,
          status: plain.status,
          recommendation: plain.recommendation,
          line_count: plain.lines?.length || 0,
          issued_at: plain.issued_at,
          updated_at: plain.updated_at,
          created_at: plain.created_at,
        };
      }),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * Registered units available to add onto a transcript.
 * Prefer units matching the transcript placement; fall back to all active registrations.
 * GET /api/transcripts/students/:studentId/registered-units
 */
exports.listRegisteredUnits = async (req, res) => {
  try {
    const studentId = normalizeUuid(req.params.studentId, "studentId");
    await loadStudent(studentId);

    const year =
      req.query.year_of_study != null && req.query.year_of_study !== ""
        ? parseYear(req.query.year_of_study)
        : null;
    const semester =
      req.query.semester != null && req.query.semester !== ""
        ? parseSemester(req.query.semester)
        : null;
    const academicYear = req.query.academic_year
      ? normalizeAcademicYear(req.query.academic_year)
      : null;

    const unitWhere = {};
    if (year != null) unitWhere.year_of_study = year;
    if (semester != null) unitWhere.semester = semester;
    if (academicYear) unitWhere.academic_year = academicYear;

    const registrations = await StudentUnitRegistration.findAll({
      where: { student_id: studentId, status: "registered" },
      include: [
        {
          model: Unit,
          as: "unit",
          required: true,
          where: Object.keys(unitWhere).length ? unitWhere : undefined,
          attributes: [
            "id",
            "code",
            "name",
            "hours",
            "credits",
            "year_of_study",
            "semester",
            "academic_year",
            "programme_id",
            "department_id",
          ],
        },
      ],
      order: [
        [{ model: Unit, as: "unit" }, "code", "ASC"],
      ],
    });

    return res.json({
      success: true,
      data: registrations.map((r) => {
        const plain = r.get({ plain: true });
        const u = plain.unit;
        return {
          registration_id: plain.id,
          unit_id: u.id,
          unit_code: u.code,
          course_title: u.name,
          hours: Number(u.hours) || 0,
          credits: u.credits,
          year_of_study: u.year_of_study,
          semester: u.semester,
          academic_year: u.academic_year,
          programme_id: u.programme_id,
          registered_at: plain.registered_at,
        };
      }),
      meta: {
        filtered: Boolean(year != null || semester != null || academicYear),
        count: registrations.length,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/transcripts/:id */
exports.getOne = async (req, res) => {
  try {
    const id = normalizeUuid(req.params.id, "id");
    const transcript = await loadTranscript(id);
    return res.json({ success: true, data: mapTranscriptResponse(transcript) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

async function replaceLines(transcriptId, lines, transaction) {
  await StudentTranscriptLine.destroy({ where: { transcript_id: transcriptId }, transaction });
  if (!lines.length) return;
  await StudentTranscriptLine.bulkCreate(
    lines.map((line) => ({ ...line, transcript_id: transcriptId })),
    { transaction }
  );
}

/** POST /api/transcripts */
exports.create = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const studentId = normalizeUuid(req.body.student_id, "student_id");
    const student = await loadStudent(studentId);
    const programmeId = normalizeUuid(
      req.body.programme_id || student.programme_id,
      "programme_id"
    );
    const year_of_study = parseYear(req.body.year_of_study ?? student.year_of_study);
    const semester = parseSemester(req.body.semester ?? student.semester);
    const academic_year = normalizeAcademicYear(req.body.academic_year);
    const lines = Array.isArray(req.body.lines) ? req.body.lines.map(mapLineInput) : [];

    if (lines.length === 0) {
      throw httpError(
        400,
        "Add at least one registered unit before saving a transcript."
      );
    }

    // Ensure every line with a registration_id belongs to this student and is registered
    for (const line of lines) {
      if (!line.registration_id) continue;
      const reg = await StudentUnitRegistration.findOne({
        where: {
          id: line.registration_id,
          student_id: studentId,
          status: "registered",
        },
        transaction: t,
      });
      if (!reg) {
        throw httpError(
          400,
          `Unit ${line.unit_code} is not registered for this student. Students must register units before transcripts can be issued.`
        );
      }
    }

    const existing = await StudentTranscript.findOne({
      where: {
        student_id: studentId,
        programme_id: programmeId,
        year_of_study,
        semester,
        academic_year,
      },
      transaction: t,
    });
    if (existing) {
      throw httpError(
        409,
        "A transcript already exists for this student, programme, year, semester, and academic year. Open it to edit."
      );
    }

    const status = req.body.status === "issued" ? "issued" : "draft";
    const actorId = req.user?.id || null;

    const transcript = await StudentTranscript.create(
      {
        student_id: studentId,
        programme_id: programmeId,
        year_of_study,
        semester,
        academic_year,
        school_label:
          String(req.body.school_label || "").trim() || defaultSchoolLabel(student.get({ plain: true })),
        date_of_admission: req.body.date_of_admission || defaultAdmissionDate(student.get({ plain: true })),
        date_of_graduation: req.body.date_of_graduation || null,
        recommendation: String(req.body.recommendation || "").trim() || null,
        notes: String(req.body.notes || "").trim() || null,
        status,
        issued_at: status === "issued" ? new Date() : null,
        issued_by: status === "issued" ? actorId : null,
        created_by: actorId,
      },
      { transaction: t }
    );

    await replaceLines(transcript.id, lines, t);
    await t.commit();

    const full = await loadTranscript(transcript.id);
    return res.status(201).json({ success: true, data: mapTranscriptResponse(full) });
  } catch (error) {
    await t.rollback();
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message:
          "A transcript already exists for this student placement. Open the existing transcript to edit.",
      });
    }
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** PUT /api/transcripts/:id */
exports.update = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = normalizeUuid(req.params.id, "id");
    const transcript = await StudentTranscript.findByPk(id, { transaction: t });
    if (!transcript) throw httpError(404, "Transcript not found.");

    const year_of_study =
      req.body.year_of_study != null
        ? parseYear(req.body.year_of_study)
        : transcript.year_of_study;
    const semester =
      req.body.semester != null ? parseSemester(req.body.semester) : transcript.semester;
    const academic_year = req.body.academic_year
      ? normalizeAcademicYear(req.body.academic_year)
      : transcript.academic_year;
    const programme_id = req.body.programme_id
      ? normalizeUuid(req.body.programme_id, "programme_id")
      : transcript.programme_id;

    let status = transcript.status;
    if (req.body.status === "issued" || req.body.status === "draft") {
      status = req.body.status;
    }

    const actorId = req.user?.id || null;
    const patch = {
      programme_id,
      year_of_study,
      semester,
      academic_year,
      status,
    };
    if (req.body.school_label !== undefined) {
      patch.school_label = String(req.body.school_label || "").trim() || null;
    }
    if (req.body.date_of_admission !== undefined) {
      patch.date_of_admission = req.body.date_of_admission || null;
    }
    if (req.body.date_of_graduation !== undefined) {
      patch.date_of_graduation = req.body.date_of_graduation || null;
    }
    if (req.body.recommendation !== undefined) {
      patch.recommendation = String(req.body.recommendation || "").trim() || null;
    }
    if (req.body.notes !== undefined) {
      patch.notes = String(req.body.notes || "").trim() || null;
    }
    if (status === "issued" && transcript.status !== "issued") {
      patch.issued_at = new Date();
      patch.issued_by = actorId;
    }
    if (status === "draft") {
      patch.issued_at = null;
      patch.issued_by = null;
    }

    await transcript.update(patch, { transaction: t });

    if (Array.isArray(req.body.lines)) {
      const lines = req.body.lines.map(mapLineInput);
      if (lines.length === 0) {
        throw httpError(400, "A transcript must keep at least one unit line.");
      }
      for (const line of lines) {
        if (!line.registration_id) continue;
        const reg = await StudentUnitRegistration.findOne({
          where: {
            id: line.registration_id,
            student_id: transcript.student_id,
            status: "registered",
          },
          transaction: t,
        });
        if (!reg) {
          throw httpError(
            400,
            `Unit ${line.unit_code} is not registered for this student.`
          );
        }
      }
      await replaceLines(transcript.id, lines, t);
    }

    await t.commit();
    const full = await loadTranscript(id);
    return res.json({ success: true, data: mapTranscriptResponse(full) });
  } catch (error) {
    await t.rollback();
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Another transcript already uses this student placement.",
      });
    }
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/transcripts/:id — drafts only */
exports.remove = async (req, res) => {
  try {
    const id = normalizeUuid(req.params.id, "id");
    const transcript = await StudentTranscript.findByPk(id);
    if (!transcript) throw httpError(404, "Transcript not found.");
    if (transcript.status === "issued") {
      throw httpError(400, "Issued transcripts cannot be deleted. Set them back to draft first.");
    }
    await transcript.destroy();
    return res.json({ success: true, message: "Transcript deleted." });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

async function sendPdf(res, payload, filename) {
  const buffer = await buildTranscriptPdfBuffer(payload);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  return res.send(buffer);
}

/** GET /api/transcripts/:id/pdf */
exports.getPdf = async (req, res) => {
  try {
    const id = normalizeUuid(req.params.id, "id");
    const transcript = await loadTranscript(id);
    const plain = mapTranscriptResponse(transcript);
    const admission = plain.student?.admission_number || "student";
    return sendPdf(
      res,
      {
        student: plain.student,
        programme: plain.programme,
        transcript: plain,
        lines: plain.lines,
      },
      `transcript-${admission}-${plain.academic_year.replace("/", "-")}.pdf`
    );
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * Live PDF preview without saving.
 * POST /api/transcripts/preview
 */
exports.previewPdf = async (req, res) => {
  try {
    const studentId = normalizeUuid(req.body.student_id, "student_id");
    const student = await loadStudent(studentId);
    const studentPlain = student.get({ plain: true });
    const programmeId = normalizeUuid(
      req.body.programme_id || student.programme_id,
      "programme_id"
    );

    let programme = studentPlain.programme;
    if (!programme || programme.id !== programmeId) {
      programme = await Programme.findByPk(programmeId, {
        attributes: ["id", "name", "category", "award"],
        include: [
          {
            model: Department,
            as: "departments",
            attributes: ["id", "name", "code"],
            through: { attributes: [] },
          },
        ],
      });
      programme = programme ? programme.get({ plain: true }) : null;
    }

    const lines = Array.isArray(req.body.lines)
      ? req.body.lines.map(mapLineInput)
      : [];

    const transcript = {
      year_of_study: parseYear(req.body.year_of_study ?? student.year_of_study),
      semester: parseSemester(req.body.semester ?? student.semester),
      academic_year: req.body.academic_year
        ? normalizeAcademicYear(req.body.academic_year)
        : "2025/2026",
      school_label:
        String(req.body.school_label || "").trim() || defaultSchoolLabel(studentPlain),
      date_of_admission: req.body.date_of_admission || defaultAdmissionDate(studentPlain),
      date_of_graduation: req.body.date_of_graduation || null,
      recommendation: String(req.body.recommendation || "").trim() || null,
      status: req.body.status === "issued" ? "issued" : "draft",
      issued_at: req.body.status === "issued" ? new Date() : null,
    };

    const admission = studentPlain.admission_number || "student";
    return sendPdf(
      res,
      {
        student: studentPlain,
        programme,
        transcript,
        lines,
      },
      `transcript-preview-${admission}.pdf`
    );
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
