const fs = require("fs");
const path = require("path");
const { Assignment, AssignmentSubmission, Student, Teacher } = require("../models");
const { convertToRelativePath } = require("../utils/filePath");
const { isPdfFormAssignment } = require("../utils/assignmentForm");
const { isStudentAssignedToAssignment, isAssignmentOpen } = require("../utils/assignmentAssignedStudents");
const {
  normalizeManualPdfAnswers,
  PDF_SOURCE_MANUAL,
  readFileBytes,
} = require("../utils/examPdfForm");
const { normalizeWorkingPaper } = require("../utils/pdfManualAnswers");
const { ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");
const { v4: uuidv4 } = require("uuid");

const PDF_WORKING_PAPER_ACCEPT = ["image/*", "application/pdf"];
const PDF_MAX_WORKING_PAPERS = 20;
const PDF_MAX_WORKING_PAPER_MB = 25;
const PDF_MAX_MARKED_RETURN_MB = 25;

async function findStudentByUser(userId) {
  if (!userId) return null;
  return Student.findOne({ where: { user_id: userId } });
}

async function findTeacherByUser(userId) {
  if (!userId) return null;
  return Teacher.findOne({ where: { user_id: userId }, attributes: ["id"] });
}

function isAdminRole(role) {
  return ADMIN_PORTAL_API_ROLES.includes(role) || SCHOOL_ADMIN_ROLES.includes(role);
}

async function assertCanManageAssignment(req, assignment) {
  if (!assignment) {
    const err = new Error("Assignment not found.");
    err.statusCode = 404;
    throw err;
  }
  if (isAdminRole(req.user?.role)) return;
  if (req.user?.role !== "teacher") {
    const err = new Error("Forbidden.");
    err.statusCode = 403;
    throw err;
  }
  const teacher = await findTeacherByUser(req.user.id);
  if (!teacher || String(assignment.teacher_id) !== String(teacher.id)) {
    const err = new Error("You can only manage assignments you created.");
    err.statusCode = 403;
    throw err;
  }
}

async function assertCanAccessAssignmentPdf(req, assignment) {
  if (!assignment) {
    const err = new Error("Assignment not found.");
    err.statusCode = 404;
    throw err;
  }
  if (req.user?.role === "student") {
    if (!isPdfFormAssignment(assignment)) {
      const err = new Error("This assignment is not available as a PDF assignment.");
      err.statusCode = 400;
      throw err;
    }
    if (assignment.status !== "published") {
      const err = new Error("This assignment is not published.");
      err.statusCode = 403;
      throw err;
    }
    const student = await findStudentByUser(req.user?.id);
    if (!student || !isStudentAssignedToAssignment(assignment, student.id)) {
      const err = new Error("You are not assigned to this assignment.");
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  await assertCanManageAssignment(req, assignment);
}

exports.uploadAssignmentPdfTemplate = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);
    if (!req.file) return res.status(400).json({ success: false, message: "PDF file is required." });

    const relPath = convertToRelativePath(req.file.path);
    if (assignment.pdf_template_path && assignment.pdf_template_path !== relPath) {
      const oldAbs = path.join(__dirname, "..", "..", String(assignment.pdf_template_path).replace(/^\/+/, ""));
      await fs.promises.unlink(oldAbs).catch(() => {});
    }

    await assignment.update({
      assignment_type: "pdf_form",
      pdf_template_path: relPath,
    });

    const updated = await Assignment.findByPk(assignment.id);
    return res.json({
      success: true,
      data: {
        pdf_template_path: updated.pdf_template_path,
        message:
          "Assignment PDF uploaded. Students will read this paper and add their own question numbers and answers.",
      },
    });
  } catch (error) {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    const code = error.statusCode || 400;
    return res.status(code).json({ success: false, message: error.message || "PDF upload failed." });
  }
};

exports.getAssignmentPdfTemplate = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    await assertCanAccessAssignmentPdf(req, assignment);
    if (!assignment?.pdf_template_path) {
      return res.status(404).json({ success: false, message: "Assignment PDF has not been uploaded yet." });
    }
    const bytes = await readFileBytes(assignment.pdf_template_path);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="assignment-${assignment.id}.pdf"`);
    return res.send(bytes);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

async function findStudentByUser(userId) {
  if (!userId) return null;
  return Student.findOne({ where: { user_id: userId } });
}

function mimeMatchesAccept(mimetype, acceptList) {
  const mime = String(mimetype || "").toLowerCase();
  const list = Array.isArray(acceptList) ? acceptList : PDF_WORKING_PAPER_ACCEPT;
  return list.some((pattern) => {
    const p = String(pattern || "").toLowerCase().trim();
    if (!p) return false;
    if (p.endsWith("/*")) return mime.startsWith(p.slice(0, -1));
    return mime === p;
  });
}

const rejectUploadedFile = async (req, res, status, message) => {
  if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
  return res.status(status).json({ success: false, message });
};

async function loadDraftSubmission(submissionId, studentId) {
  const submission = await AssignmentSubmission.findByPk(submissionId, {
    include: [{ model: Assignment, as: "assignment" }],
  });
  if (!submission) return { error: { status: 404, message: "Submission not found." } };
  if (submission.student_id !== studentId) {
    return { error: { status: 403, message: "You cannot edit this submission." } };
  }
  if (submission.status !== "draft") {
    return { error: { status: 400, message: "Submission already submitted." } };
  }
  if (!isAssignmentOpen(submission.assignment)) {
    return { error: { status: 403, message: "This assignment is closed." } };
  }
  if (!isPdfFormAssignment(submission.assignment)) {
    return { error: { status: 400, message: "This is not a PDF assignment." } };
  }
  return { submission };
}

exports.saveSubmissionPdfAnswers = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    const loaded = await loadDraftSubmission(req.params.submissionId, student.id);
    if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    const { submission } = loaded;

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
      entries: fieldValues.entries !== undefined ? fieldValues.entries : existingNorm.entries,
      working_papers: hasWorkingPapersPatch ? fieldValues.working_papers : existingNorm.working_papers,
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
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const loaded = await loadDraftSubmission(req.params.submissionId, student.id);
    if (loaded.error) return rejectUploadedFile(req, res, loaded.error.status, loaded.error.message);
    const { submission } = loaded;

    if (!mimeMatchesAccept(req.file.mimetype, PDF_WORKING_PAPER_ACCEPT)) {
      return rejectUploadedFile(req, res, 400, "Only images and PDF files are allowed.");
    }
    if (req.file.size > PDF_MAX_WORKING_PAPER_MB * 1024 * 1024) {
      return rejectUploadedFile(req, res, 400, `File exceeds ${PDF_MAX_WORKING_PAPER_MB} MB.`);
    }

    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : normalizeManualPdfAnswers(null);
    const workingPapers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    if (workingPapers.length >= PDF_MAX_WORKING_PAPERS) {
      return rejectUploadedFile(req, res, 400, `Maximum ${PDF_MAX_WORKING_PAPERS} files allowed.`);
    }

    const relPath = convertToRelativePath(req.file.path);
    const fileId = uuidv4();
    workingPapers.push(
      normalizeWorkingPaper(
        {
          id: fileId,
          url: relPath,
          name: req.file.originalname || path.basename(req.file.path),
          mime: req.file.mimetype,
          size: req.file.size,
          uploaded_at: new Date().toISOString(),
        },
        workingPapers.length
      )
    );

    const nextJson = normalizeManualPdfAnswers({
      ...raw,
      mode: PDF_SOURCE_MANUAL,
      working_papers: workingPapers,
    });
    await submission.update({ pdf_answers_json: nextJson });
    return res.json({ success: true, data: { pdf_answers_json: nextJson, file_id: fileId } });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSubmissionPdfWorkingPaper = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    const loaded = await loadDraftSubmission(req.params.submissionId, student.id);
    if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    const { submission } = loaded;

    const fileId = String(req.params.fileId || "");
    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : {};
    const workingPapers = Array.isArray(raw.working_papers) ? raw.working_papers : [];
    const index = workingPapers.findIndex((f) => String(f?.id) === fileId);
    if (index < 0) return res.status(404).json({ success: false, message: "Working paper not found." });

    const nextJson = normalizeManualPdfAnswers({
      ...raw,
      mode: PDF_SOURCE_MANUAL,
      working_papers: workingPapers.filter((_, i) => i !== index),
    });
    await submission.update({ pdf_answers_json: nextJson });
    return res.json({ success: true, data: { pdf_answers_json: nextJson } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

async function loadSubmittedPdfSubmissionForMarking(assignmentId, submissionId) {
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) return { error: { status: 404, message: "Assignment not found." } };
  if (!isPdfFormAssignment(assignment)) {
    return { error: { status: 400, message: "This is not a PDF assignment." } };
  }
  const submission = await AssignmentSubmission.findByPk(submissionId);
  if (!submission || submission.assignment_id !== assignment.id) {
    return { error: { status: 404, message: "Submission not found." } };
  }
  if (submission.status !== "submitted") {
    return { error: { status: 400, message: "Only submitted work can be marked." } };
  }
  return { assignment, submission };
}

exports.uploadSubmissionPdfWorkingPaperMarkedReturn = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) return rejectUploadedFile(req, res, loaded.error.status, loaded.error.message);
    const { submission } = loaded;

    if (!mimeMatchesAccept(req.file.mimetype, PDF_WORKING_PAPER_ACCEPT)) {
      return rejectUploadedFile(req, res, 400, "Only images and PDF files are allowed.");
    }
    if (req.file.size > PDF_MAX_MARKED_RETURN_MB * 1024 * 1024) {
      return rejectUploadedFile(req, res, 400, `File exceeds ${PDF_MAX_MARKED_RETURN_MB} MB.`);
    }

    const fileId = String(req.params.fileId || "");
    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : {};
    const workingPapers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = workingPapers.findIndex((f) => String(f?.id) === fileId);
    if (index < 0) return rejectUploadedFile(req, res, 404, "Working paper not found.");

    const relPath = convertToRelativePath(req.file.path);
    const paper = { ...workingPapers[index] };
    if (req.body?.marker_comment) {
      paper.marker_comment = String(req.body.marker_comment).trim().slice(0, 2000);
    }
    paper.marked_return = {
      url: relPath,
      name: req.file.originalname || path.basename(req.file.path),
      mime: req.file.mimetype,
      size: req.file.size,
      marked_at: new Date().toISOString(),
      marked_by_user_id: req.user?.id ? String(req.user.id) : null,
    };
    workingPapers[index] = paper;

    const nextJson = {
      ...raw,
      mode: raw.mode || PDF_SOURCE_MANUAL,
      entries: Array.isArray(raw.entries) ? raw.entries : [],
      working_papers: workingPapers,
    };
    await submission.update({ pdf_answers_json: nextJson });
    return res.json({ success: true, data: { pdf_answers_json: nextJson } });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSubmissionPdfWorkingPaperMarkedReturn = async (req, res) => {
  try {
    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    const { submission } = loaded;

    const fileId = String(req.params.fileId || "");
    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : {};
    const workingPapers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = workingPapers.findIndex((f) => String(f?.id) === fileId);
    if (index < 0) return res.status(404).json({ success: false, message: "Working paper not found." });

    const paper = { ...workingPapers[index] };
    delete paper.marked_return;
    workingPapers[index] = paper;
    const nextJson = { ...raw, working_papers: workingPapers };
    await submission.update({ pdf_answers_json: nextJson });
    return res.json({ success: true, data: { pdf_answers_json: nextJson } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSubmissionPdfWorkingPaperMarking = async (req, res) => {
  try {
    const loaded = await loadSubmittedPdfSubmissionForMarking(req.params.id, req.params.submissionId);
    if (loaded.error) return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    const { submission } = loaded;

    const fileId = String(req.params.fileId || "");
    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : {};
    const workingPapers = Array.isArray(raw.working_papers) ? [...raw.working_papers] : [];
    const index = workingPapers.findIndex((f) => String(f?.id) === fileId);
    if (index < 0) return res.status(404).json({ success: false, message: "Working paper not found." });

    const paper = { ...workingPapers[index] };
    if (req.body?.marker_comment !== undefined) {
      const rawComment = req.body.marker_comment;
      paper.marker_comment =
        rawComment == null || String(rawComment).trim() === "" ? null : String(rawComment).trim().slice(0, 2000);
    }
    workingPapers[index] = paper;
    const nextJson = { ...raw, working_papers: workingPapers };
    await submission.update({ pdf_answers_json: nextJson });
    return res.json({ success: true, data: { pdf_answers_json: nextJson } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
