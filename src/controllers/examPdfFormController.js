const fs = require("fs");
const path = require("path");
const { Exam, ExamSubmission, Student } = require("../models");
const { convertToRelativePath } = require("../utils/filePath");
const { assertCanAccessExam, loadExamForAccess } = require("../services/examScheduleAccess");
const findStudentByUser = async (userId) => {
  if (!userId) return null;
  return Student.findOne({ where: { user_id: userId } });
};
const {
  isPdfFormExam,
  buildPdfExamSchema,
  fillPdfFromAnswers,
  buildFlatPdfAnswerSheet,
  buildManualPdfAnswerSheet,
  isFlatPdfExam,
  isManualPdfExam,
  normalizeManualPdfAnswers,
  hasManualPdfSubmissionContent,
  PDF_SOURCE_MANUAL,
  gradePdfAnswers,
  readFileBytes,
} = require("../utils/examPdfForm");
const { normalizeWorkingPaper } = require("../utils/pdfManualAnswers");

const PDF_WORKING_PAPER_ACCEPT = ["image/*", "application/pdf"];
const PDF_MAX_WORKING_PAPERS = 20;
const PDF_MAX_WORKING_PAPER_MB = 25;
const PDF_MAX_MARKED_RETURN_MB = 25;

function mimeMatchesAccept(mimetype, acceptList) {
  const mime = String(mimetype || "").toLowerCase();
  const list = Array.isArray(acceptList) ? acceptList : PDF_WORKING_PAPER_ACCEPT;
  return list.some((pattern) => {
    const p = String(pattern || "").toLowerCase().trim();
    if (!p) return false;
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1);
      return mime.startsWith(prefix);
    }
    return mime === p;
  });
}

const rejectUploadedFile = async (req, res, status, message) => {
  if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
  return res.status(status).json({ success: false, message });
};

async function assertPdfFormExam(exam) {
  if (!exam) {
    const err = new Error("Exam not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!isPdfFormExam(exam)) {
    const err = new Error("This exam is not a PDF form exam.");
    err.statusCode = 400;
    throw err;
  }
}

async function loadSubmittedPdfSubmissionForMarking(examId, submissionId) {
  const exam = await Exam.findByPk(examId);
  if (!exam) return { error: { status: 404, message: "Exam not found." } };
  const submission = await ExamSubmission.findByPk(submissionId);
  if (!submission || submission.exam_id !== exam.id) {
    return { error: { status: 404, message: "Submission not found for this exam." } };
  }
  if (submission.status !== "submitted") {
    return { error: { status: 400, message: "Only submitted exams can be marked." } };
  }
  try {
    await assertPdfFormExam(exam);
  } catch (error) {
    return { error: { status: error.statusCode || 400, message: error.message } };
  }
  return { exam, submission };
}

function submissionPdfAnswersRaw(submission) {
  return submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
    ? submission.pdf_answers_json
    : {};
}

async function unlinkMarkedReturnFile(markedReturn) {
  if (!markedReturn?.url) return;
  const abs = path.join(__dirname, "..", "..", String(markedReturn.url).replace(/^\/+/, ""));
  await fs.promises.unlink(abs).catch(() => {});
}

async function persistWorkingPapersUpdate(submission, raw, working_papers) {
  await submission.update({
    pdf_answers_json: {
      ...raw,
      mode: raw.mode || PDF_SOURCE_MANUAL,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      working_papers,
    },
  });
  await submission.reload();
}

exports.uploadExamPdfTemplate = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "PDF file is required." });

    const pdfBytes = await fs.promises.readFile(req.file.path);
    const { schema, fieldCount, pdf_source_type } = await buildPdfExamSchema(pdfBytes);

    const relPath = convertToRelativePath(req.file.path);
    if (exam.pdf_template_path && exam.pdf_template_path !== relPath) {
      const oldAbs = path.join(__dirname, "..", "..", String(exam.pdf_template_path).replace(/^\/+/, ""));
      await fs.promises.unlink(oldAbs).catch(() => {});
    }

    const layout =
      exam.exam_layout_json && typeof exam.exam_layout_json === "object" ? { ...exam.exam_layout_json } : {};
    layout.pdf_source_type = pdf_source_type || PDF_SOURCE_MANUAL;

    await exam.update({
      exam_type: "pdf_form",
      pdf_template_path: relPath,
      pdf_field_schema_json: schema,
      exam_layout_json: layout,
      updated_by: req.user?.id || null,
    });

    const updated = await Exam.findByPk(exam.id);
    return res.json({
      success: true,
      data: {
        pdf_template_path: updated.pdf_template_path,
        pdf_field_schema_json: updated.pdf_field_schema_json,
        field_count: fieldCount,
        pdf_source_type: pdf_source_type || PDF_SOURCE_MANUAL,
        message:
          "PDF uploaded. Students will read this paper and add their own question numbers and answers.",
      },
    });
  } catch (error) {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    console.error("[exam] pdf-template upload failed:", error);
    return res.status(400).json({ success: false, message: error.message || "PDF upload failed." });
  }
};

exports.updateExamPdfAnswerKey = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    await assertPdfFormExam(exam);
    const answerKey =
      req.body?.pdf_answer_key_json && typeof req.body.pdf_answer_key_json === "object"
        ? req.body.pdf_answer_key_json
        : req.body?.answer_key && typeof req.body.answer_key === "object"
        ? req.body.answer_key
        : {};
    await exam.update({ pdf_answer_key_json: answerKey, updated_by: req.user?.id || null });
    return res.json({ success: true, data: { pdf_answer_key_json: exam.pdf_answer_key_json } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getExamPdfTemplate = async (req, res) => {
  try {
    const exam = await loadExamForAccess(req.params.id);
    await assertCanAccessExam(req, exam);
    const full = await Exam.findByPk(exam.id, {
      attributes: ["id", "pdf_template_path", "pdf_field_schema_json", "exam_type"],
    });
    if (!full?.pdf_template_path) {
      return res.status(404).json({ success: false, message: "PDF template has not been uploaded yet." });
    }
    if (req.user?.role === "student" && !isPdfFormExam(full)) {
      return res.status(400).json({ success: false, message: "This exam is not available as a PDF exam." });
    }
    const bytes = await readFileBytes(full.pdf_template_path);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="exam-${full.id}.pdf"`);
    return res.send(bytes);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.saveSubmissionPdfAnswers = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });

    const submission = await ExamSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Exam, as: "exam" }],
    });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    if (submission.student_id !== student.id) {
      return res.status(403).json({ success: false, message: "You cannot edit this submission." });
    }
    if (submission.status !== "draft") {
      return res.status(400).json({ success: false, message: "Submission already submitted." });
    }
    await assertPdfFormExam(submission.exam);

    const fieldValues =
      req.body?.field_values && typeof req.body.field_values === "object"
        ? req.body.field_values
        : req.body?.pdf_answers && typeof req.body.pdf_answers === "object"
        ? req.body.pdf_answers
        : {};
    const existingNorm = normalizeManualPdfAnswers(submission.pdf_answers_json);
    const hasWorkingPapersPatch = Object.prototype.hasOwnProperty.call(fieldValues, "working_papers");
    const normalized = normalizeManualPdfAnswers({
      mode: PDF_SOURCE_MANUAL,
      entries:
        fieldValues.entries !== undefined ? fieldValues.entries : existingNorm.entries,
      working_papers: hasWorkingPapersPatch
        ? fieldValues.working_papers
        : existingNorm.working_papers,
    });
    await submission.update({ pdf_answers_json: normalized });
    await submission.reload();
    return res.json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.uploadSubmissionPdfWorkingPaper = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const submission = await ExamSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Exam, as: "exam" }],
    });
    if (!submission) return rejectUploadedFile(req, res, 404, "Submission not found");
    if (submission.student_id !== student.id) {
      return rejectUploadedFile(req, res, 403, "You cannot edit this submission.");
    }
    if (submission.status !== "draft") {
      return rejectUploadedFile(req, res, 400, "Submission already submitted.");
    }
    await assertPdfFormExam(submission.exam);

    if (!mimeMatchesAccept(req.file.mimetype, PDF_WORKING_PAPER_ACCEPT)) {
      return rejectUploadedFile(req, res, 400, "Only photos (images) and PDF scans are allowed.");
    }
    if (req.file.size > PDF_MAX_WORKING_PAPER_MB * 1024 * 1024) {
      return rejectUploadedFile(req, res, 400, `File exceeds maximum size of ${PDF_MAX_WORKING_PAPER_MB} MB.`);
    }

    const current = normalizeManualPdfAnswers(submission.pdf_answers_json);
    if (current.working_papers.length >= PDF_MAX_WORKING_PAPERS) {
      return rejectUploadedFile(req, res, 400, `Maximum ${PDF_MAX_WORKING_PAPERS} working paper file(s) allowed.`);
    }

    const relPath =
      convertToRelativePath(req.file.path) ||
      `uploads/exam-pdf-working-papers/${path.basename(req.file.path)}`;
    const fileEntry = {
      id: `paper-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      url: relPath,
      name: req.file.originalname || path.basename(req.file.path),
      mime: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    };
    const next = normalizeManualPdfAnswers({
      ...current,
      working_papers: [...current.working_papers, fileEntry],
    });
    await submission.update({ pdf_answers_json: next });
    await submission.reload();
    return res.json({ success: true, data: submission, uploaded_file: fileEntry });
  } catch (error) {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSubmissionPdfWorkingPaper = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });

    const submission = await ExamSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Exam, as: "exam" }],
    });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    if (submission.student_id !== student.id) {
      return res.status(403).json({ success: false, message: "You cannot edit this submission." });
    }
    if (submission.status !== "draft") {
      return res.status(400).json({ success: false, message: "Submission already submitted." });
    }
    await assertPdfFormExam(submission.exam);

    const fileId = String(req.params.fileId || "").trim();
    const current = normalizeManualPdfAnswers(submission.pdf_answers_json);
    const target = current.working_papers.find((file) => file.id === fileId);
    if (!target) return res.status(404).json({ success: false, message: "Working paper not found." });

    const next = normalizeManualPdfAnswers({
      ...current,
      working_papers: current.working_papers.filter((file) => file.id !== fileId),
    });
    await submission.update({ pdf_answers_json: next });
    await submission.reload();

    if (target.url) {
      const abs = path.join(__dirname, "..", "..", String(target.url).replace(/^\/+/, ""));
      await fs.promises.unlink(abs).catch(() => {});
    }

    return res.json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.uploadSubmissionPdfWorkingPaperMarkedReturn = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) {
      return rejectUploadedFile(req, res, loaded.error.status, loaded.error.message);
    }
    const { submission } = loaded;

    if (!mimeMatchesAccept(req.file.mimetype, PDF_WORKING_PAPER_ACCEPT)) {
      return rejectUploadedFile(req, res, 400, "Only photos (images) and PDF files are allowed.");
    }
    if (req.file.size > PDF_MAX_MARKED_RETURN_MB * 1024 * 1024) {
      return rejectUploadedFile(
        req,
        res,
        400,
        `File exceeds maximum size of ${PDF_MAX_MARKED_RETURN_MB} MB.`
      );
    }

    const fileId = String(req.params.fileId || "").trim();
    if (!fileId) return rejectUploadedFile(req, res, 400, "Working paper id is required.");

    const raw = submissionPdfAnswersRaw(submission);
    const papers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = papers.findIndex((file) => String(file?.id) === fileId);
    if (index < 0) return rejectUploadedFile(req, res, 404, "Working paper not found.");

    const relPath =
      convertToRelativePath(req.file.path) ||
      `uploads/exam-pdf-marked-returns/${path.basename(req.file.path)}`;
    const markedReturn = {
      url: relPath,
      name: req.file.originalname || path.basename(req.file.path),
      mime: req.file.mimetype,
      size: req.file.size,
      marked_at: new Date().toISOString(),
      marked_by_user_id: req.user?.id != null ? String(req.user.id) : null,
    };

    const existing = papers[index];
    if (existing?.marked_return) {
      await unlinkMarkedReturnFile(existing.marked_return);
    }

    const nextPaper = normalizeWorkingPaper(
      {
        ...existing,
        marked_return: markedReturn,
      },
      index
    );

    if (req.body?.marker_comment !== undefined) {
      const rawComment = req.body.marker_comment;
      nextPaper.marker_comment =
        rawComment == null || String(rawComment).trim() === ""
          ? null
          : String(rawComment).trim().slice(0, 2000);
    }

    papers[index] = nextPaper;
    await persistWorkingPapersUpdate(submission, raw, papers);

    return res.json({
      success: true,
      data: submission,
      marked_return: nextPaper.marked_return,
      marker_comment: nextPaper.marker_comment || null,
    });
  } catch (error) {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSubmissionPdfWorkingPaperMarkedReturn = async (req, res) => {
  try {
    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    const { submission } = loaded;

    const fileId = String(req.params.fileId || "").trim();
    if (!fileId) return res.status(400).json({ success: false, message: "Working paper id is required." });

    const raw = submissionPdfAnswersRaw(submission);
    const papers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = papers.findIndex((file) => String(file?.id) === fileId);
    if (index < 0) return res.status(404).json({ success: false, message: "Working paper not found." });

    const existing = papers[index];
    if (!existing?.marked_return) {
      return res.status(404).json({ success: false, message: "No marked return file for this working paper." });
    }

    await unlinkMarkedReturnFile(existing.marked_return);
    const nextPaper = normalizeWorkingPaper({ ...existing, marked_return: null }, index);
    papers[index] = nextPaper;
    await persistWorkingPapersUpdate(submission, raw, papers);

    return res.json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSubmissionPdfWorkingPaperMarking = async (req, res) => {
  try {
    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    const { submission } = loaded;

    if (req.body?.marker_comment === undefined) {
      return res.status(400).json({ success: false, message: "Provide marker_comment." });
    }

    const fileId = String(req.params.fileId || "").trim();
    if (!fileId) return res.status(400).json({ success: false, message: "Working paper id is required." });

    const raw = submissionPdfAnswersRaw(submission);
    const papers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = papers.findIndex((file) => String(file?.id) === fileId);
    if (index < 0) return res.status(404).json({ success: false, message: "Working paper not found." });

    const rawComment = req.body.marker_comment;
    const marker_comment =
      rawComment == null || String(rawComment).trim() === "" ? null : String(rawComment).trim().slice(0, 2000);

    papers[index] = normalizeWorkingPaper({ ...papers[index], marker_comment }, index);
    await persistWorkingPapersUpdate(submission, raw, papers);

    return res.json({
      success: true,
      data: submission,
      marker_comment,
      marked_return: papers[index].marked_return || null,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.buildCompletedPdfForSubmission = async (submission, exam) => {
  if (!exam?.pdf_template_path) throw new Error("PDF template is missing on this exam.");
  const answers =
    submission.pdf_answers_json && typeof submission.pdf_answers_json === "object" ? submission.pdf_answers_json : {};

  if (isManualPdfExam(exam) || Array.isArray(answers.entries)) {
    return buildManualPdfAnswerSheet({
      title: exam.title || "Exam answers",
      answers,
    });
  }

  const schema = Array.isArray(exam.pdf_field_schema_json) ? exam.pdf_field_schema_json : [];

  if (isFlatPdfExam(exam)) {
    return buildFlatPdfAnswerSheet({
      title: exam.title || "Exam answers",
      schema,
      answers,
    });
  }

  const templateBytes = await readFileBytes(exam.pdf_template_path);
  try {
    return await fillPdfFromAnswers(templateBytes, answers);
  } catch (e) {
    if (String(e?.message || e).includes("FLAT_PDF")) {
      return buildFlatPdfAnswerSheet({ title: exam.title, schema, answers });
    }
    throw e;
  }
};

exports.finalizePdfFormSubmission = async (submission, exam) => {
  const filled = await exports.buildCompletedPdfForSubmission(submission, exam);
  const uploadDir = path.join(__dirname, "..", "..", "uploads", "exam-pdf-completed");
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const suffix = isManualPdfExam(exam) || Array.isArray(submission.pdf_answers_json?.entries) ? "answer-sheet" : isFlatPdfExam(exam) ? "answer-sheet" : "completed";
  const filename = `${suffix}-${submission.id}-${Date.now()}.pdf`;
  const abs = path.join(uploadDir, filename);
  await fs.promises.writeFile(abs, filled);
  const rel = convertToRelativePath(abs);
  const grading = isManualPdfExam(exam)
    ? { score: null, maxScore: null, percentage: null, breakdown: [] }
    : gradePdfAnswers(
        exam.pdf_answer_key_json,
        submission.pdf_answers_json,
        Number(exam.total_marks) || 100
      );
  await submission.update({
    pdf_completed_file_path: rel,
    pdf_auto_score: grading.score,
    pdf_auto_grading_json: grading,
  });
  return { rel, grading };
};
