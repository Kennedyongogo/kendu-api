const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const {
  ReportCard,
  ReportCardLine,
  Student,
  User,
  Exam,
  ExamAttempt,
  StudentExamResult,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  SchoolProfile,
} = require("../models");
const { loadSchoolReportBranding } = require("../services/schoolReportBranding");
const { resolveOverallGradeBand } = require("../utils/overallGradeResolver");
const { generateReportCardPdf } = require("../services/reportCardPdf");

const userAttrs = ["id", "full_name", "username", "email"];

function normId(id) {
  return id == null ? "" : String(id).trim();
}

function unlinkReportCardPdf(pdfUrl) {
  if (!pdfUrl || typeof pdfUrl !== "string") return Promise.resolve();
  const marker = "/uploads/report-cards/";
  const idx = pdfUrl.indexOf(marker);
  if (idx === -1) return Promise.resolve();
  const filename = pdfUrl.slice(idx + marker.length);
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return Promise.resolve();
  }
  const filePath = path.join(__dirname, "..", "..", "uploads", "report-cards", filename);
  return fs.promises.unlink(filePath).catch(() => {});
}

const REPORT_CARDS_UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "report-cards");

function reportCardPdfPathFromUrl(pdfUrl) {
  if (!pdfUrl || typeof pdfUrl !== "string") return null;
  const marker = "/uploads/report-cards/";
  const idx = pdfUrl.indexOf(marker);
  if (idx === -1) return null;
  const filename = pdfUrl.slice(idx + marker.length);
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return null;
  return path.join(REPORT_CARDS_UPLOAD_DIR, filename);
}

function buildPdfDataFromReportCard(row) {
  const plain = row?.get ? row.get({ plain: true }) : row;
  const student = plain.student || row.student;
  const studentPlain = student?.get ? student.get({ plain: true }) : student;
  const studentName =
    studentPlain?.user?.full_name?.trim() ||
    studentPlain?.user?.username?.trim() ||
    studentPlain?.admission_number ||
    "Student";
  const lines = (plain.lines || row.lines || []).map((l) => {
    const line = l?.get ? l.get({ plain: true }) : l;
    return {
      exam_title: line.exam_title,
      marks_obtained: line.marks_obtained,
      total_marks: line.total_marks,
      grade: line.grade,
    };
  });
  return {
    studentName,
    admissionNumber: studentPlain?.admission_number,
    className: plain.curriculum_class?.name || studentPlain?.curriculum_class?.name || "—",
    levelName: plain.curriculum_class_level?.name || null,
    title: plain.title,
    lines,
    totalObtained: Number(plain.total_marks_obtained),
    totalPossible: plain.total_marks_possible != null ? Number(plain.total_marks_possible) : null,
    overallGrade: plain.overall_grade,
    overallRemarks: plain.overall_remarks,
  };
}

async function ensureReportCardPdfFile(row) {
  const existingPath = reportCardPdfPathFromUrl(row.pdf_url);
  if (existingPath && fs.existsSync(existingPath)) {
    return { filePath: existingPath, publicUrl: row.pdf_url };
  }
  const { filePath, publicUrl } = await generateReportCardPdf(buildPdfDataFromReportCard(row));
  await row.update({ pdf_url: publicUrl });
  return { filePath, publicUrl };
}

async function loadReportCardForPdf(id, options = {}) {
  const where = { id };
  if (options.studentId) where.student_id = options.studentId;
  return ReportCard.findOne({
    where,
    include: [
      { model: ReportCardLine, as: "lines", separate: true, order: [["sort_order", "ASC"]] },
      { model: Student, as: "student", include: [{ model: User, as: "user", attributes: userAttrs }] },
      { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name"], required: false },
      { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"], required: false },
    ],
  });
}

function streamReportCardPdfFile(res, row, filePath) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="report-card-${row.id}.pdf"`);
  return res.sendFile(path.resolve(filePath));
}

function serializeReportCard(row) {
  const plain = row?.get ? row.get({ plain: true }) : { ...row };
  const rawTs = plain.created_at ?? plain.createdAt ?? plain.updated_at ?? plain.updatedAt;
  let created_at = plain.created_at ?? plain.createdAt ?? null;
  if (rawTs) {
    const d = new Date(rawTs);
    if (!Number.isNaN(d.getTime())) created_at = d.toISOString();
  }
  return { ...plain, created_at };
}

function marksFromResult(result) {
  if (!result) return null;
  if (result.marks_obtained != null && Number.isFinite(Number(result.marks_obtained))) {
    return Number(result.marks_obtained);
  }
  if (result.marks != null && Number.isFinite(Number(result.marks))) {
    return Number(result.marks);
  }
  return null;
}

async function loadStudentContext(studentId) {
  const student = await Student.findByPk(studentId, {
    include: [
      { model: User, as: "user", attributes: userAttrs },
      { model: Curriculum, as: "curriculum", attributes: ["id", "name"] },
      { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
    ],
  });
  if (!student) return null;
  return student;
}

async function buildLinesFromExamIds(studentId, examIds) {
  const normIds = [...new Set((examIds || []).map(normId).filter(Boolean))];
  if (!normIds.length) {
    return { lines: [], totalObtained: 0, totalPossible: 0, error: "Select at least one graded exam." };
  }

  const exams = await Exam.findAll({
    where: { id: { [Op.in]: normIds } },
    attributes: ["id", "title", "total_marks", "curriculum_id", "curriculum_class_id"],
  });
  const examMap = new Map(exams.map((e) => [normId(e.id), e]));

  const results = await StudentExamResult.findAll({
    where: { student_id: studentId, exam_id: { [Op.in]: normIds } },
  });
  const resultByExam = new Map();
  for (const r of results) {
    const key = normId(r.exam_id);
    if (key && !resultByExam.has(key)) resultByExam.set(key, r);
  }

  const attempts = await ExamAttempt.findAll({
    where: { student_id: studentId, exam_id: { [Op.in]: normIds } },
    attributes: ["id", "exam_id", "total_score", "percentage", "is_passed"],
    order: [["updated_at", "DESC"]],
  });
  const attemptByExam = new Map();
  for (const a of attempts) {
    const key = normId(a.exam_id);
    if (key && !attemptByExam.has(key)) attemptByExam.set(key, a);
  }

  const lines = [];
  let totalObtained = 0;
  let totalPossible = 0;
  let order = 0;

  for (const examId of normIds) {
    const exam = examMap.get(examId);
    if (!exam) {
      return {
        lines: [],
        totalObtained: 0,
        totalPossible: 0,
        error: "One or more selected exams could not be found.",
      };
    }
    const result = resultByExam.get(examId);
    const attempt = attemptByExam.get(examId);
    let marks = marksFromResult(result);
    if (marks == null && attempt?.total_score != null && Number.isFinite(Number(attempt.total_score))) {
      marks = Number(attempt.total_score);
    }
    if (marks == null || !Number.isFinite(marks)) {
      return {
        lines: [],
        totalObtained: 0,
        totalPossible: 0,
        error: `Exam "${exam.title}" is not graded for this student yet. Save marks and run Grade on the submission first.`,
      };
    }
    const possible = exam.total_marks != null ? Number(exam.total_marks) : null;
    totalObtained += marks;
    if (possible != null && Number.isFinite(possible)) totalPossible += possible;

    lines.push({
      exam_id: normId(exam.id),
      student_exam_result_id: result?.id || null,
      exam_title: exam.title || "Exam",
      marks_obtained: marks,
      total_marks: possible,
      grade: result?.grade || result?.grade_letter || null,
      sort_order: order++,
    });
  }

  if (!lines.length) {
    return { lines: [], totalObtained: 0, totalPossible: 0, error: "No valid exams selected." };
  }

  return { lines, totalObtained, totalPossible, error: null };
}

exports.getReportCardTemplate = async (_req, res) => {
  try {
    const brand = await loadSchoolReportBranding();
    const profile = await SchoolProfile.findOne({
      order: [["updated_at", "DESC"]],
      attributes: ["logo_url", "name", "phone", "address", "city", "state", "country"],
    });
    return res.json({
      success: true,
      data: {
        school_name: brand.name,
        tagline: brand.tagline,
        phone: brand.phone,
        address: brand.addressLine,
        email: brand.email,
        logo_url: profile?.logo_url || null,
        has_logo: Boolean(brand.logoPath || profile?.logo_url),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listGradedExamsForStudent = async (req, res) => {
  try {
    const studentId = req.query.student_id;
    const curriculumId = req.query.curriculum_id;
    const classId = req.query.curriculum_class_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: "student_id is required." });
    }

    const where = { student_id: studentId, exam_id: { [Op.ne]: null } };
    const results = await StudentExamResult.findAll({
      where,
      include: [
        {
          model: Exam,
          as: "exam",
          required: true,
          attributes: ["id", "title", "total_marks", "curriculum_id", "curriculum_class_id", "curriculum_class_level_id"],
        },
      ],
      order: [["graded_at", "DESC"]],
    });

    const byExam = new Map();

    for (const r of results) {
      if (curriculumId && normId(r.exam?.curriculum_id) !== normId(curriculumId)) continue;
      if (classId && normId(r.exam?.curriculum_class_id) !== normId(classId)) continue;
      const marks = marksFromResult(r);
      if (!Number.isFinite(marks)) continue;
      const examId = normId(r.exam_id || r.exam?.id);
      if (!examId) continue;
      byExam.set(examId, {
        exam_id: examId,
        result_id: r.id,
        exam_title: r.exam?.title || "Exam",
        total_marks: r.exam?.total_marks,
        marks_obtained: marks,
        grade: r.grade || r.grade_letter,
        graded_at: r.graded_at,
      });
    }

    const attempts = await ExamAttempt.findAll({
      where: { student_id: studentId, exam_id: { [Op.ne]: null }, total_score: { [Op.ne]: null } },
      include: [
        {
          model: Exam,
          as: "exam",
          required: true,
          attributes: ["id", "title", "total_marks", "curriculum_id", "curriculum_class_id"],
        },
      ],
      order: [["updated_at", "DESC"]],
    });

    for (const a of attempts) {
      if (curriculumId && normId(a.exam?.curriculum_id) !== normId(curriculumId)) continue;
      if (classId && normId(a.exam?.curriculum_class_id) !== normId(classId)) continue;
      const examId = normId(a.exam_id || a.exam?.id);
      if (!examId || byExam.has(examId)) continue;
      const score = Number(a.total_score);
      if (!Number.isFinite(score)) continue;
      byExam.set(examId, {
        exam_id: examId,
        result_id: null,
        exam_title: a.exam?.title || "Exam",
        total_marks: a.exam?.total_marks,
        marks_obtained: score,
        grade: null,
        graded_at: a.submitted_at || a.updated_at,
      });
    }

    const data = Array.from(byExam.values()).sort(
      (a, b) => new Date(b.graded_at || 0) - new Date(a.graded_at || 0)
    );

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.previewReportCard = async (req, res) => {
  try {
    const body = req.body || {};
    const studentId = body.student_id;
    const examIds = Array.isArray(body.exam_ids) ? body.exam_ids.map(String) : [];
    const curriculumId = body.curriculum_id;
    const classId = body.curriculum_class_id;

    const student = await loadStudentContext(studentId);
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });

    const { lines, totalObtained, totalPossible, error: lineError } = await buildLinesFromExamIds(studentId, examIds);
    if (lineError) return res.status(400).json({ success: false, message: lineError });

    const cid = curriculumId || student.curriculum_id;
    const clid = classId || student.curriculum_class_id;
    const gradeResult = await resolveOverallGradeBand({
      curriculum_id: cid,
      curriculum_class_id: clid,
      totalMarks: totalObtained,
    });

    if (!gradeResult.band) {
      return res.status(400).json({
        success: false,
        message: gradeResult.error,
        data: { lines, total_marks_obtained: totalObtained, total_marks_possible: totalPossible },
      });
    }

    return res.json({
      success: true,
      data: {
        lines,
        total_marks_obtained: totalObtained,
        total_marks_possible: totalPossible,
        overall_grade: gradeResult.overall_grade,
        overall_remarks: gradeResult.remarks,
        range_from: gradeResult.range_from,
        range_to: gradeResult.range_to,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createReportCard = async (req, res) => {
  try {
    const body = req.body || {};
    const studentId = body.student_id;
    const examIds = Array.isArray(body.exam_ids) ? body.exam_ids.map(String) : [];
    const curriculumId = body.curriculum_id;
    const classId = body.curriculum_class_id;
    const levelId = body.curriculum_class_level_id || null;
    const title = body.title ? String(body.title).trim().slice(0, 120) : null;

    const student = await loadStudentContext(studentId);
    if (!student) return res.status(404).json({ success: false, message: "Student not found." });

    const { lines, totalObtained, totalPossible, error: lineError } = await buildLinesFromExamIds(studentId, examIds);
    if (lineError) return res.status(400).json({ success: false, message: lineError });

    const cid = curriculumId || student.curriculum_id;
    const clid = classId || student.curriculum_class_id;
    if (!cid || !clid) {
      return res.status(400).json({ success: false, message: "Student must have curriculum and class set." });
    }

    const gradeResult = await resolveOverallGradeBand({
      curriculum_id: cid,
      curriculum_class_id: clid,
      totalMarks: totalObtained,
    });
    if (!gradeResult.band) {
      return res.status(400).json({ success: false, message: gradeResult.error });
    }

    let levelName = null;
    if (levelId) {
      const lvl = await CurriculumClassLevel.findByPk(levelId, { attributes: ["name"] });
      levelName = lvl?.name || null;
    }

    const studentName =
      student.user?.full_name?.trim() || student.user?.username?.trim() || student.admission_number || "Student";

    const { publicUrl } = await generateReportCardPdf({
      studentName,
      admissionNumber: student.admission_number,
      className: student.curriculum_class?.name || "—",
      levelName,
      title,
      lines,
      totalObtained,
      totalPossible: totalPossible || null,
      overallGrade: gradeResult.overall_grade,
      overallRemarks: gradeResult.remarks,
    });

    const card = await ReportCard.create({
      student_id: studentId,
      curriculum_id: cid,
      curriculum_class_id: clid,
      curriculum_class_level_id: levelId,
      title,
      total_marks_obtained: totalObtained,
      total_marks_possible: totalPossible || null,
      overall_grade: gradeResult.overall_grade,
      overall_remarks: gradeResult.remarks,
      pdf_url: publicUrl,
      created_by: req.user?.id || null,
    });

    await ReportCardLine.bulkCreate(
      lines.map((l) => ({
        report_card_id: card.id,
        exam_id: l.exam_id,
        student_exam_result_id: l.student_exam_result_id,
        exam_title: l.exam_title,
        marks_obtained: l.marks_obtained,
        total_marks: l.total_marks,
        grade: l.grade,
        sort_order: l.sort_order,
      }))
    );

    const full = await ReportCard.findByPk(card.id, {
      include: [
        { model: ReportCardLine, as: "lines" },
        { model: Student, as: "student", include: [{ model: User, as: "user", attributes: userAttrs }] },
      ],
    });

    return res.status(201).json({ success: true, data: serializeReportCard(full) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

async function resolveStudentForPortalUser(userId) {
  return Student.findOne({
    where: { user_id: userId },
    attributes: ["id", "curriculum_id", "curriculum_class_id"],
  });
}

/** Student portal: list report cards for the logged-in student only. */
exports.listMyStudentReportCards = async (req, res) => {
  try {
    const student = await resolveStudentForPortalUser(req.user?.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = { student_id: student.id };

    const count = await ReportCard.count({ where });
    const rows = await ReportCard.findAll({
      where,
      include: [
        { model: ReportCardLine, as: "lines", separate: true, order: [["sort_order", "ASC"]] },
        { model: Curriculum, as: "curriculum", attributes: ["id", "name"], required: false },
        { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name"], required: false },
        { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"], required: false },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serializeReportCard),
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Student portal: fetch one report card if it belongs to the logged-in student. */
exports.getMyStudentReportCard = async (req, res) => {
  try {
    const student = await resolveStudentForPortalUser(req.user?.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const row = await ReportCard.findOne({
      where: { id: req.params.id, student_id: student.id },
      include: [
        { model: ReportCardLine, as: "lines", separate: true, order: [["sort_order", "ASC"]] },
        { model: Curriculum, as: "curriculum", attributes: ["id", "name"], required: false },
        { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name"], required: false },
        { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"], required: false },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Report card not found." });
    return res.json({ success: true, data: serializeReportCard(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listReportCards = async (req, res) => {
  try {
    const where = {};
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.curriculum_id) where.curriculum_id = req.query.curriculum_id;
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 15));
    const offset = (page - 1) * limit;

    const count = await ReportCard.count({ where });
    const rows = await ReportCard.findAll({
      where,
      include: [
        { model: ReportCardLine, as: "lines", separate: true, order: [["sort_order", "ASC"]] },
        { model: Student, as: "student", include: [{ model: User, as: "user", attributes: userAttrs }] },
        { model: Curriculum, as: "curriculum", attributes: ["id", "name"], required: false },
        { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name"], required: false },
        { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"], required: false },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serializeReportCard),
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteReportCard = async (req, res) => {
  try {
    const row = await ReportCard.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Report card not found." });
    await unlinkReportCardPdf(row.pdf_url);
    await ReportCardLine.destroy({ where: { report_card_id: row.id } });
    await row.destroy();
    return res.json({ success: true, message: "Report card deleted." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getReportCard = async (req, res) => {
  try {
    const row = await ReportCard.findByPk(req.params.id, {
      include: [
        { model: ReportCardLine, as: "lines" },
        { model: Student, as: "student", include: [{ model: User, as: "user", attributes: userAttrs }] },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Report card not found." });
    return res.json({ success: true, data: serializeReportCard(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.streamReportCardPdf = async (req, res) => {
  try {
    const row = await loadReportCardForPdf(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Report card not found." });
    const { filePath } = await ensureReportCardPdfFile(row);
    return streamReportCardPdfFile(res, row, filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.streamMyStudentReportCardPdf = async (req, res) => {
  try {
    const student = await resolveStudentForPortalUser(req.user?.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }
    const row = await loadReportCardForPdf(req.params.id, { studentId: student.id });
    if (!row) return res.status(404).json({ success: false, message: "Report card not found." });
    const { filePath } = await ensureReportCardPdfFile(row);
    return streamReportCardPdfFile(res, row, filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
