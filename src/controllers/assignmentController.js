const { Op } = require("sequelize");
const {
  sequelize,
  Assignment,
  AssignmentQuestion,
  AssignmentSubmission,
  AssignmentAnswer,
  Student,
  Teacher,
  User,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumSubject,
  AcademicTerm,
} = require("../models");
const { ASSIGNMENT_PDF_FORM_TYPE, isPdfFormAssignment } = require("../utils/assignmentForm");
const { normalizeWallClockToDate, DEFAULT_SCHEDULE_TIMEZONE } = require("../utils/examScheduleTime");
const {
  validateAndNormalizeAssignedStudentIds,
  isStudentAssignedToAssignment,
  pickStudentAssignmentSubmission,
  isAssignmentOpen,
} = require("../utils/assignmentAssignedStudents");
const { submissionHasManualPdfEntries, parseManualPdfAnswers } = require("../utils/pdfManualAnswers");
const {
  normalizeManualPdfAnswers,
  PDF_SOURCE_MANUAL,
  hasManualPdfSubmissionContent,
} = require("../utils/examPdfForm");
const { ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");
const fs = require("fs");
const path = require("path");
const { convertToRelativePath } = require("../utils/filePath");

function normalizeScopeIds(body = {}) {
  const curriculum_class_id = String(body.curriculum_class_id || "").trim() || null;
  const curriculum_class_level_id =
    String(body.curriculum_class_level_id || body.term_id || "").trim() || null;
  return { curriculum_class_id, curriculum_class_level_id };
}

const userSafe = { attributes: { exclude: ["password_hash"] } };

const assignmentListIncludes = [
  { model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"] },
  { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
  { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"] },
  { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
  { model: AcademicTerm, as: "academic_term", attributes: ["id", "term_name", "term_number"] },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    attributes: ["id"],
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

const assignmentDetailIncludes = [
  ...assignmentListIncludes,
  {
    model: AssignmentQuestion,
    as: "questions",
    separate: true,
    order: [["order_number", "ASC"]],
  },
];

const ASSIGNMENT_STATUSES = new Set(["draft", "published", "archived"]);

function normalizeQuestionOptions(raw, questionType) {
  const type = String(questionType || "short_text").trim();
  let rawOpts = raw;
  if (typeof rawOpts === "string") {
    try {
      rawOpts = JSON.parse(rawOpts);
    } catch {
      rawOpts = {};
    }
  }

  if (type === "multiple_choice" || type === "multi_select") {
    if (!rawOpts || typeof rawOpts !== "object" || Array.isArray(rawOpts)) rawOpts = {};
    let choices = [];
    if (Array.isArray(rawOpts.choices)) choices = rawOpts.choices;
    else if (typeof rawOpts.choices === "string") choices = rawOpts.choices.split(",");
    choices = choices.map((c) => String(c).trim()).filter(Boolean);
    if (choices.length === 1 && choices[0].includes(",")) {
      choices = choices[0].split(",").map((s) => s.trim()).filter(Boolean);
    }
    return { choices };
  }

  if (type === "file_upload") {
    const o = rawOpts && typeof rawOpts === "object" && !Array.isArray(rawOpts) ? rawOpts : {};
    return {
      accept: Array.isArray(o.accept) ? o.accept : ["image/*", "application/pdf"],
      max_files: Math.min(5, Math.max(1, Number(o.max_files) || 1)),
      max_size_mb: Math.min(25, Math.max(1, Number(o.max_size_mb) || 10)),
      upload_hint: String(o.upload_hint || "").trim(),
    };
  }

  return null;
}

function normalizeQuestion(raw, index) {
  const q = raw && typeof raw === "object" ? raw : {};
  const questionType = String(q.question_type || "short_text").trim();
  return {
    question_text: String(q.question_text || q.text || "").trim(),
    question_type: questionType,
    options: normalizeQuestionOptions(q.options, questionType),
    marks: Number.isFinite(Number(q.marks)) ? Math.max(0, Number(q.marks)) : 0,
    order_number: Number.isFinite(Number(q.order_number)) ? Number(q.order_number) : index + 1,
    required: Boolean(q.required),
  };
}

function normalizeDueDateInput(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return normalizeWallClockToDate(value, DEFAULT_SCHEDULE_TIMEZONE);
}

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

function hasMeaningfulAnswer(answer) {
  if (!answer) return false;
  if (String(answer.answer_text || "").trim()) return true;
  const json = answer.answer_json;
  if (!json) return false;
  if (Array.isArray(json.files) && json.files.length) return true;
  if (Array.isArray(json) && json.length) return true;
  if (json.selected != null && String(json.selected).trim()) return true;
  return false;
}

exports.listAssignments = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.status && ASSIGNMENT_STATUSES.has(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.assignment_type) where.assignment_type = req.query.assignment_type;
    if (req.user?.role === "teacher") {
      const teacher = await findTeacherByUser(req.user.id);
      if (!teacher) {
        return res.status(403).json({ success: false, message: "Teacher profile not found." });
      }
      where.teacher_id = teacher.id;
    }

    const { rows, count } = await Assignment.findAndCountAll({
      where,
      include: assignmentListIncludes,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAssignment = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id, { include: assignmentDetailIncludes });
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found." });
    if (req.user?.role === "teacher") {
      await assertCanManageAssignment(req, row);
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.createAssignment = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const body = { ...req.body };
    const title = String(body.title || "").trim();
    if (!title) throw new Error("Assignment title is required.");
    const assignmentType =
      String(body.assignment_type || "questions").trim() === ASSIGNMENT_PDF_FORM_TYPE
        ? ASSIGNMENT_PDF_FORM_TYPE
        : "questions";
    const isPdf = assignmentType === ASSIGNMENT_PDF_FORM_TYPE;
    const normalizedQuestions = Array.isArray(body.questions)
      ? body.questions.map((q, i) => normalizeQuestion(q, i)).filter((q) => q.question_text)
      : [];
    if (!isPdf && !normalizedQuestions.length) {
      throw new Error("At least one question is required for an online assignment.");
    }
    const scope = normalizeScopeIds(body);
    if (!scope.curriculum_class_id) throw new Error("Class is required.");
    if (!scope.curriculum_class_level_id) throw new Error("Term is required.");

    const assignedStudentIds = await validateAndNormalizeAssignedStudentIds(body.assigned_student_ids, {
      curriculum_class_id: scope.curriculum_class_id,
      curriculum_class_level_id: scope.curriculum_class_level_id,
    });

    let teacherId = body.teacher_id || null;
    if (req.user?.role === "teacher") {
      const teacher = await findTeacherByUser(req.user.id);
      if (!teacher) throw new Error("Teacher profile not found.");
      teacherId = teacher.id;
    }

    const status = body.status && ASSIGNMENT_STATUSES.has(String(body.status)) ? String(body.status) : "draft";
    const row = await Assignment.create(
      {
        title,
        description: body.description || null,
        instructions: body.instructions || null,
        assignment_type: assignmentType,
        status,
        curriculum_id: body.curriculum_id || null,
        curriculum_class_id: scope.curriculum_class_id,
        curriculum_class_level_id: scope.curriculum_class_level_id,
        curriculum_subject_id: body.curriculum_subject_id || null,
        academic_term_id: null,
        teacher_id: teacherId,
        created_by_user_id: req.user?.id || null,
        assigned_student_ids: assignedStudentIds,
        due_date: normalizeDueDateInput(body.due_date),
        published_at: status === "published" ? new Date() : null,
        is_active: body.is_active !== false,
      },
      { transaction: tx }
    );

    if (normalizedQuestions.length) {
      await AssignmentQuestion.bulkCreate(
        normalizedQuestions.map((q) => ({ ...q, assignment_id: row.id })),
        { transaction: tx }
      );
    }

    await tx.commit();
    const created = await Assignment.findByPk(row.id, { include: assignmentDetailIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateAssignment = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const row = await Assignment.findByPk(req.params.id, { transaction: tx });
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, row);

    const body = { ...req.body };
    const patch = {};
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.instructions !== undefined) patch.instructions = body.instructions || null;
    if (body.due_date !== undefined) patch.due_date = normalizeDueDateInput(body.due_date);
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    if (body.curriculum_id !== undefined) patch.curriculum_id = body.curriculum_id || null;
    if (body.curriculum_class_id !== undefined) patch.curriculum_class_id = body.curriculum_class_id || null;
    if (body.curriculum_class_level_id !== undefined) {
      patch.curriculum_class_level_id = body.curriculum_class_level_id || null;
    }
    if (body.curriculum_subject_id !== undefined) patch.curriculum_subject_id = body.curriculum_subject_id || null;
    if (body.academic_term_id !== undefined) patch.academic_term_id = body.academic_term_id || null;

    if (body.assigned_student_ids !== undefined) {
      patch.assigned_student_ids = await validateAndNormalizeAssignedStudentIds(body.assigned_student_ids, {
        curriculum_class_id: patch.curriculum_class_id ?? row.curriculum_class_id,
        curriculum_class_level_id: patch.curriculum_class_level_id ?? row.curriculum_class_level_id,
      });
    }

    let nextAssignmentType = row.assignment_type;
    if (body.assignment_type !== undefined) {
      nextAssignmentType =
        String(body.assignment_type).trim() === ASSIGNMENT_PDF_FORM_TYPE ? ASSIGNMENT_PDF_FORM_TYPE : "questions";
      patch.assignment_type = nextAssignmentType;
    }

    if (body.status && ASSIGNMENT_STATUSES.has(String(body.status))) {
      patch.status = String(body.status);
      if (patch.status === "published" && !row.published_at) patch.published_at = new Date();
    }

    await row.update(patch, { transaction: tx });

    const effectivePdf = isPdfFormAssignment({ assignment_type: nextAssignmentType });

    if (effectivePdf) {
      await AssignmentQuestion.destroy({ where: { assignment_id: row.id }, transaction: tx });
    } else if (Array.isArray(body.questions)) {
      const normalizedQuestions = body.questions
        .map((q, i) => normalizeQuestion(q, i))
        .filter((q) => q.question_text);
      if (!normalizedQuestions.length) {
        throw new Error("At least one question is required for an online assignment.");
      }
      await AssignmentQuestion.destroy({ where: { assignment_id: row.id }, transaction: tx });
      await AssignmentQuestion.bulkCreate(
        normalizedQuestions.map((q) => ({ ...q, assignment_id: row.id })),
        { transaction: tx }
      );
    }

    await tx.commit();
    const updated = await Assignment.findByPk(row.id, { include: assignmentDetailIncludes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    await tx.rollback();
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, row);
    await row.destroy();
    return res.json({ success: true, message: "Assignment deleted." });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.publishAssignment = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, row);
    if (isPdfFormAssignment(row) && !row.pdf_template_path) {
      return res.status(400).json({
        success: false,
        message: "Upload the assignment PDF before publishing.",
      });
    }
    await row.update({ status: "published", published_at: row.published_at || new Date() });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.listAssignmentSubmissionsForMarking = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id, {
      include: [{ model: AssignmentQuestion, as: "questions" }],
    });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);

    const where = { assignment_id: assignment.id };
    if (req.query.status && ["draft", "submitted"].includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { rows: submissions, count } = await AssignmentSubmission.findAndCountAll({
      where,
      distinct: true,
      limit,
      offset,
      include: [
        {
          model: Student,
          as: "student",
          attributes: ["id", "admission_number", "user_id"],
          include: [{ model: User, as: "user", ...userSafe }],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const total = typeof count === "number" ? count : count?.length || 0;
    const rows = await Promise.all(
      submissions.map(async (s) => {
        const answers = await AssignmentAnswer.findAll({
          where: { submission_id: s.id },
          include: [
            {
              model: AssignmentQuestion,
              as: "question",
              attributes: ["id", "question_text", "marks", "order_number", "question_type", "options"],
            },
          ],
          order: [[{ model: AssignmentQuestion, as: "question" }, "order_number", "ASC"]],
        });
        return {
          id: s.id,
          status: s.status,
          started_at: s.started_at,
          submitted_at: s.submitted_at,
          created_at: s.created_at,
          pdf_answers_json: s.pdf_answers_json,
          student: s.student || null,
          answers: answers.map((a) => ({
            id: a.id,
            question_id: a.question_id,
            question_text: a.question?.question_text || "Question",
            question_marks: Number(a.question?.marks || 0),
            question_type: a.question?.question_type || null,
            question_options: a.question?.options ?? null,
            marks_obtained: a.marks_obtained != null ? Number(a.marks_obtained) : null,
            marker_comment: a.marker_comment || null,
            answer_text: a.answer_text,
            answer_json: a.answer_json,
            order_number: Number(a.question?.order_number || 0),
          })),
          marking: {
            total_score: s.total_score != null ? Number(s.total_score) : null,
            marker_feedback: s.marker_feedback || null,
            graded_at: s.graded_at || null,
            marks_published: Boolean(s.marks_published),
          },
        };
      })
    );

    const questionTotal = (assignment.questions || []).reduce((sum, q) => sum + Number(q.marks || 0), 0);

    return res.json({
      success: true,
      data: {
        assignment: {
          id: assignment.id,
          title: assignment.title,
          assignment_type: assignment.assignment_type,
          total_marks: questionTotal,
        },
        submissions: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.createAssignmentSubmission = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id, {
      include: [{ model: AssignmentQuestion, as: "questions" }],
    });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    if (assignment.status !== "published") {
      return res.status(403).json({ success: false, message: "This assignment is not published yet." });
    }
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    if (!isStudentAssignedToAssignment(assignment, student.id)) {
      return res.status(403).json({ success: false, message: "You are not assigned to this assignment." });
    }
    if (!isAssignmentOpen(assignment)) {
      return res.status(403).json({ success: false, message: "This assignment is closed." });
    }

    let submission = await AssignmentSubmission.findOne({
      where: { assignment_id: assignment.id, student_id: student.id, status: "draft" },
      include: [{ model: AssignmentAnswer, as: "answers" }],
      order: [["created_at", "DESC"]],
    });
    if (!submission) {
      const submittedCount = await AssignmentSubmission.count({
        where: { assignment_id: assignment.id, student_id: student.id, status: "submitted" },
      });
      if (submittedCount >= 1) {
        return res.status(409).json({ success: false, message: "Assignment already submitted." });
      }
      submission = await AssignmentSubmission.create({
        assignment_id: assignment.id,
        student_id: student.id,
        status: "draft",
        started_at: new Date(),
        pdf_answers_json: isPdfFormAssignment(assignment)
          ? normalizeManualPdfAnswers({ mode: PDF_SOURCE_MANUAL, entries: [], working_papers: [] })
          : null,
      });
      submission = await AssignmentSubmission.findByPk(submission.id, {
        include: [{ model: AssignmentAnswer, as: "answers" }],
      });
    }
    return res.status(201).json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMyAssignmentSubmission = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    const assignment = await Assignment.findByPk(req.params.id, { include: assignmentDetailIncludes });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    if (!isStudentAssignedToAssignment(assignment, student.id)) {
      return res.status(403).json({ success: false, message: "You are not assigned to this assignment." });
    }

    const submissions = await AssignmentSubmission.findAll({
      where: { assignment_id: assignment.id, student_id: student.id },
      include: [
        { model: AssignmentAnswer, as: "answers", include: [{ model: AssignmentQuestion, as: "question" }] },
      ],
      order: [["created_at", "DESC"]],
    });
    const submission = pickStudentAssignmentSubmission(submissions);
    const open = isAssignmentOpen(assignment);
    const canEdit = open && (!submission || submission.status === "draft");
    return res.json({
      success: true,
      data: submission,
      assignment,
      access: {
        can_edit: canEdit,
        is_submitted: submission?.status === "submitted",
        is_closed: !open,
        needs_submission: !submission && open,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.saveSubmissionAnswers = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) throw new Error("Student profile not found.");
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId, { transaction: tx });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found." });
    if (submission.student_id !== student.id) {
      return res.status(403).json({ success: false, message: "You cannot edit this submission." });
    }
    if (submission.status !== "draft") throw new Error("Submission already submitted.");

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    for (const item of answers) {
      if (!item?.question_id) continue;
      const payload = {
        answer_text: item.answer_text != null ? String(item.answer_text) : null,
        answer_json: item.answer_json !== undefined ? item.answer_json : null,
      };
      const existing = await AssignmentAnswer.findOne({
        where: { submission_id: submission.id, question_id: item.question_id },
        transaction: tx,
      });
      if (existing) await existing.update(payload, { transaction: tx });
      else {
        await AssignmentAnswer.create(
          { submission_id: submission.id, question_id: item.question_id, ...payload },
          { transaction: tx }
        );
      }
    }
    await tx.commit();
    const updated = await AssignmentSubmission.findByPk(submission.id, {
      include: [{ model: AssignmentAnswer, as: "answers" }],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitAssignmentSubmission = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId, {
      include: [
        { model: Assignment, as: "assignment", include: [{ model: AssignmentQuestion, as: "questions" }] },
        { model: AssignmentAnswer, as: "answers" },
      ],
    });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found." });
    if (submission.student_id !== student.id) {
      return res.status(403).json({ success: false, message: "You cannot submit this submission." });
    }
    if (submission.status === "submitted") return res.json({ success: true, data: submission });

    const assignment = submission.assignment;
    if (!isAssignmentOpen(assignment)) {
      return res.status(403).json({ success: false, message: "This assignment is closed." });
    }

    if (isPdfFormAssignment(assignment)) {
      const answers =
        submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
          ? submission.pdf_answers_json
          : {};
      if (!hasManualPdfSubmissionContent(answers)) {
        return res.status(400).json({
          success: false,
          message: "Add at least one typed answer or upload a working paper before submitting.",
        });
      }
    } else {
      const requiredQuestions = (assignment?.questions || []).filter((q) => q.required);
      const answerMap = new Map((submission.answers || []).map((a) => [a.question_id, a]));
      const hasAny = (submission.answers || []).some((a) => hasMeaningfulAnswer(a));
      if (!hasAny) {
        return res.status(400).json({ success: false, message: "Answer at least one question before submitting." });
      }
      for (const rq of requiredQuestions) {
        const ans = answerMap.get(rq.id);
        if (!hasMeaningfulAnswer(ans)) {
          return res.status(400).json({
            success: false,
            message: `Required question not answered: ${rq.question_text}`,
          });
        }
      }
    }

    await submission.update({ status: "submitted", submitted_at: new Date() });
    return res.json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.markAssignmentAnswer = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.assignment_id !== assignment.id) {
      return res.status(404).json({ success: false, message: "Submission not found." });
    }
    const answer = await AssignmentAnswer.findByPk(req.params.answerId, {
      include: [{ model: AssignmentQuestion, as: "question", attributes: ["id", "marks"] }],
    });
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found." });
    }

    const payload = {};
    const hasMarks =
      req.body?.marks_obtained !== undefined && req.body?.marks_obtained !== null && req.body?.marks_obtained !== "";
    if (hasMarks) {
      const marksObtained = Number(req.body.marks_obtained);
      if (!Number.isFinite(marksObtained) || marksObtained < 0) {
        return res.status(400).json({ success: false, message: "marks_obtained must be a non-negative number." });
      }
      const questionMarks = Number(answer.question?.marks || 0);
      if (questionMarks > 0 && marksObtained > questionMarks) {
        return res.status(400).json({
          success: false,
          message: `marks_obtained cannot exceed question marks (${questionMarks}).`,
        });
      }
      payload.marks_obtained = marksObtained;
    }
    if (req.body?.marker_comment !== undefined) {
      const raw = req.body.marker_comment;
      payload.marker_comment = raw == null || String(raw).trim() === "" ? null : String(raw).trim().slice(0, 2000);
    }
    if (!Object.keys(payload).length) {
      return res.status(400).json({ success: false, message: "Provide marks_obtained and/or marker_comment." });
    }
    await answer.update(payload);

    const allAnswers = await AssignmentAnswer.findAll({
      where: { submission_id: submission.id },
      attributes: ["marks_obtained"],
    });
    const totalObtained = allAnswers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    await submission.update({ total_score: totalObtained, graded_at: new Date(), graded_by_user_id: req.user?.id || null });

    return res.json({
      success: true,
      data: {
        answer_id: answer.id,
        marks_obtained: answer.marks_obtained,
        marker_comment: answer.marker_comment,
        total_score: totalObtained,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.markAssignmentSubmission = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.assignment_id !== assignment.id) {
      return res.status(404).json({ success: false, message: "Submission not found." });
    }
    if (submission.status !== "submitted") {
      return res.status(400).json({ success: false, message: "Only submitted work can be marked." });
    }

    const score = Number(req.body?.total_score);
    if (!Number.isFinite(score) || score < 0) {
      return res.status(400).json({ success: false, message: "total_score must be a non-negative number." });
    }
    const markerFeedback =
      req.body?.marker_feedback !== undefined
        ? req.body.marker_feedback == null || String(req.body.marker_feedback).trim() === ""
          ? null
          : String(req.body.marker_feedback).trim().slice(0, 4000)
        : submission.marker_feedback;

    await submission.update({
      total_score: score,
      marker_feedback: markerFeedback,
      graded_at: new Date(),
      graded_by_user_id: req.user?.id || null,
    });

    return res.json({
      success: true,
      data: {
        submission_id: submission.id,
        total_score: Number(submission.total_score),
        marker_feedback: submission.marker_feedback,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.markPdfManualAnswer = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);
    if (!isPdfFormAssignment(assignment)) {
      return res.status(400).json({ success: false, message: "This is not a PDF assignment." });
    }
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.assignment_id !== assignment.id) {
      return res.status(404).json({ success: false, message: "Submission not found." });
    }
    if (!submissionHasManualPdfEntries(submission)) {
      return res.status(400).json({ success: false, message: "No manual PDF entries on this submission." });
    }

    const entryId = String(req.params.entryId || "");
    const raw =
      submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
        ? submission.pdf_answers_json
        : {};
    const entries = Array.isArray(raw.entries) ? [...raw.entries] : [];
    const index = entries.findIndex((entry) => String(entry?.id) === entryId);
    if (index < 0) return res.status(404).json({ success: false, message: "PDF answer entry not found." });

    const entry = { ...entries[index] };
    const hasMarks =
      req.body?.marks_obtained !== undefined && req.body?.marks_obtained !== null && req.body?.marks_obtained !== "";
    if (hasMarks) {
      const marksObtained = Number(req.body.marks_obtained);
      if (!Number.isFinite(marksObtained) || marksObtained < 0) {
        return res.status(400).json({ success: false, message: "marks_obtained must be a non-negative number." });
      }
      entry.marks_obtained = marksObtained;
    }
    if (req.body?.marker_comment !== undefined) {
      const rawComment = req.body.marker_comment;
      entry.marker_comment =
        rawComment == null || String(rawComment).trim() === "" ? null : String(rawComment).trim().slice(0, 2000);
    }
    if (!hasMarks && req.body?.marker_comment === undefined) {
      return res.status(400).json({ success: false, message: "Provide marks_obtained and/or marker_comment." });
    }

    entries[index] = entry;
    await submission.update({
      pdf_answers_json: {
        ...raw,
        mode: raw.mode || PDF_SOURCE_MANUAL,
        entries,
        working_papers: Array.isArray(raw.working_papers) ? raw.working_papers : [],
      },
    });

    return res.json({
      success: true,
      data: {
        entry_id: entryId,
        marks_obtained: entry.marks_obtained != null ? Number(entry.marks_obtained) : null,
        marker_comment: entry.marker_comment || null,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.publishAssignmentMarks = async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
    await assertCanManageAssignment(req, assignment);
    const submission = await AssignmentSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.assignment_id !== assignment.id) {
      return res.status(404).json({ success: false, message: "Submission not found." });
    }
    if (submission.total_score == null && !isPdfFormAssignment(assignment)) {
      const answers = await AssignmentAnswer.findAll({
        where: { submission_id: submission.id },
        attributes: ["marks_obtained"],
      });
      const total = answers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
      if (!answers.some((a) => a.marks_obtained != null)) {
        return res.status(400).json({ success: false, message: "Save marks before publishing to the student." });
      }
      await submission.update({ total_score: total });
    }
    if (submission.total_score == null) {
      return res.status(400).json({ success: false, message: "Save the total score before publishing." });
    }
    await submission.update({ marks_published: true, graded_at: submission.graded_at || new Date() });
    return res.json({ success: true, data: submission });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.listMyStudentAssignments = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(404).json({ success: false, message: "Student profile not found." });

    const studentSubmissions = await AssignmentSubmission.findAll({
      where: { student_id: student.id },
      attributes: ["id", "assignment_id", "status", "submitted_at", "marks_published", "total_score"],
      order: [["created_at", "DESC"]],
    });
    const submissionExamIds = [
      ...new Set(
        studentSubmissions
          .filter((s) => s.status === "submitted" || s.submitted_at)
          .map((s) => s.assignment_id)
          .filter(Boolean)
      ),
    ];

    let assignedRows = [];
    if (student.curriculum_class_id) {
      const where = {
        is_active: true,
        curriculum_class_id: student.curriculum_class_id,
        status: "published",
      };
      if (student.curriculum_id) where.curriculum_id = student.curriculum_id;
      if (student.curriculum_class_level_id) {
        where.curriculum_class_level_id = student.curriculum_class_level_id;
      }
      const rows = await Assignment.findAll({ where, include: assignmentListIncludes });
      assignedRows = rows.filter((r) => isStudentAssignedToAssignment(r, student.id));
    }

    const assignedIds = new Set(assignedRows.map((r) => String(r.id)));
    const retainedIds = submissionExamIds.filter((id) => !assignedIds.has(String(id)));
    const retainedRows = retainedIds.length
      ? await Assignment.findAll({ where: { id: { [Op.in]: retainedIds } }, include: assignmentListIncludes })
      : [];
    const merged = [...assignedRows];
    for (const row of retainedRows) {
      if (!assignedIds.has(String(row.id))) merged.push(row);
    }

    const submissionByAssignment = new Map();
    for (const s of studentSubmissions) {
      if (!submissionByAssignment.has(s.assignment_id)) submissionByAssignment.set(s.assignment_id, s);
    }

    const data = merged.map((r) => {
      const sub = submissionByAssignment.get(r.id);
      const isAssigned = isStudentAssignedToAssignment(r, student.id);
      const open = isAssignmentOpen(r);
      return {
        id: r.id,
        title: r.title,
        assignment_type: r.assignment_type,
        due_date: r.due_date,
        instructions: r.instructions,
        curriculum: r.curriculum,
        curriculum_class: r.curriculum_class,
        curriculum_subject: r.curriculum_subject,
        teacher: r.teacher,
        submission_status: sub?.status || null,
        submitted_at: sub?.submitted_at || null,
        marks_published: Boolean(sub?.marks_published),
        total_score: sub?.marks_published ? sub?.total_score : null,
        can_open: isAssigned && open && sub?.status !== "submitted",
        is_assigned: isAssigned,
        retained_by_submission: !isAssigned && Boolean(sub),
        is_closed: !open,
      };
    });

    data.sort((a, b) => {
      const ta = a.due_date ? new Date(a.due_date).getTime() : 0;
      const tb = b.due_date ? new Date(b.due_date).getTime() : 0;
      return tb - ta;
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load assignments." });
  }
};

exports.getMyStudentAssignmentFeedback = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(404).json({ success: false, message: "Student profile not found." });
    const assignment = await Assignment.findByPk(req.params.assignmentId, {
      include: [{ model: AssignmentQuestion, as: "questions" }],
    });
    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });

    const submission = await AssignmentSubmission.findOne({
      where: { assignment_id: assignment.id, student_id: student.id, status: "submitted" },
      order: [["submitted_at", "DESC"]],
    });
    if (!submission) {
      return res.status(404).json({ success: false, message: "No submitted work found for this assignment." });
    }
    if (!submission.marks_published) {
      return res.status(404).json({
        success: false,
        code: "MARKS_NOT_PUBLISHED",
        message: "Your teacher has not published marks for this assignment yet.",
      });
    }

    const questionTotal = (assignment.questions || []).reduce((sum, q) => sum + Number(q.marks || 0), 0);
    const pdfForm = isPdfFormAssignment(assignment);
    let questions = [];
    let workingPapers = [];

    if (pdfForm) {
      const { entries, working_papers: papers } = parseManualPdfAnswers(submission.pdf_answers_json);
      questions = entries.map((entry, index) => ({
          orderNumber: index + 1,
          question: entry.question ? `Question ${entry.question}` : `Answer ${index + 1}`,
          answer: String(entry.answer || "").trim() || "—",
          score: entry.marks_obtained != null ? Number(entry.marks_obtained) : null,
          maxScore: null,
          comment: entry.marker_comment || null,
        }));
      workingPapers = papers.map((paper, index) => ({
        id: paper.id,
        name: paper.name || `Working paper ${index + 1}`,
        mime: paper.mime || null,
        studentFileUrl: paper.url || null,
        markerComment: paper.marker_comment || null,
        markedReturn: paper.marked_return?.url
          ? {
              url: paper.marked_return.url,
              name: paper.marked_return.name || "Marked file",
              mime: paper.marked_return.mime || null,
            }
          : null,
      }));
    } else {
      const answers = await AssignmentAnswer.findAll({
        where: { submission_id: submission.id },
        include: [{ model: AssignmentQuestion, as: "question", required: true }],
        order: [["created_at", "ASC"]],
      });
      questions = answers
        .filter((a) => a.question)
        .sort((a, b) => Number(a.question.order_number) - Number(b.question.order_number))
        .map((a) => ({
          question: a.question.question_text,
          questionType: a.question.question_type || "short_text",
          questionOptions: a.question.options ?? null,
          orderNumber: Number(a.question.order_number || 0),
          answerText: a.answer_text,
          answerJson: a.answer_json,
          score: a.marks_obtained != null ? Number(a.marks_obtained) : null,
          maxScore: Number(a.question.marks || 0),
          comment: a.marker_comment || null,
        }));
    }

    return res.json({
      success: true,
      data: {
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        assignmentType: assignment.assignment_type,
        isPdfAssignment: pdfForm,
        pdfTemplatePath: assignment.pdf_template_path || null,
        showQuestionBreakdown: !pdfForm || questions.length > 0,
        showWorkingPapers: pdfForm && workingPapers.length > 0,
        totalScore: Number(submission.total_score || 0),
        totalMax: pdfForm ? null : questionTotal || null,
        markerFeedback: submission.marker_feedback || null,
        gradedAt: submission.graded_at || null,
        questions,
        workingPapers,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load feedback." });
  }
};

function mimeMatchesAccept(mimetype, acceptList) {
  const mime = String(mimetype || "").toLowerCase();
  const list = Array.isArray(acceptList) ? acceptList : ["image/*", "application/pdf"];
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

exports.uploadSubmissionAnswerFile = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found." });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const submission = await AssignmentSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Assignment, as: "assignment" }],
    });
    if (!submission) return rejectUploadedFile(req, res, 404, "Submission not found");
    if (submission.student_id !== student.id) {
      return rejectUploadedFile(req, res, 403, "You cannot edit this submission.");
    }
    if (submission.status !== "draft") {
      return rejectUploadedFile(req, res, 400, "Submission already submitted.");
    }

    const question = await AssignmentQuestion.findOne({
      where: { id: req.params.questionId, assignment_id: submission.assignment_id },
    });
    if (!question) return rejectUploadedFile(req, res, 404, "Question not found.");
    if (question.question_type !== "file_upload") {
      return rejectUploadedFile(req, res, 400, "This question does not accept file uploads.");
    }

    const opts = question.options && typeof question.options === "object" ? question.options : {};
    const accept = Array.isArray(opts.accept) ? opts.accept : ["image/*", "application/pdf"];
    const maxFiles = Math.min(5, Math.max(1, Number(opts.max_files) || 1));
    const maxSizeMb = Math.min(25, Math.max(1, Number(opts.max_size_mb) || 10));

    if (!mimeMatchesAccept(req.file.mimetype, accept)) {
      return rejectUploadedFile(req, res, 400, `File type not allowed. Accepted: ${accept.join(", ")}`);
    }
    if (req.file.size > maxSizeMb * 1024 * 1024) {
      return rejectUploadedFile(req, res, 400, `File exceeds maximum size of ${maxSizeMb} MB.`);
    }

    const relPath = convertToRelativePath(req.file.path);
    const fileEntry = {
      url: relPath,
      name: req.file.originalname || path.basename(req.file.path),
      mime: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    };

    let answer = await AssignmentAnswer.findOne({
      where: { submission_id: submission.id, question_id: question.id },
    });
    const prevJson =
      answer?.answer_json && typeof answer.answer_json === "object" && !Array.isArray(answer.answer_json)
        ? answer.answer_json
        : {};
    const prevFiles = Array.isArray(prevJson.files) ? prevJson.files : [];
    if (prevFiles.length >= maxFiles) {
      return rejectUploadedFile(req, res, 400, `Maximum ${maxFiles} file(s) allowed for this question.`);
    }
    const nextJson = { ...prevJson, files: [...prevFiles, fileEntry] };

    if (answer) await answer.update({ answer_json: nextJson, answer_text: null });
    else {
      answer = await AssignmentAnswer.create({
        submission_id: submission.id,
        question_id: question.id,
        answer_json: nextJson,
        answer_text: null,
      });
    }
    return res.json({ success: true, data: answer });
  } catch (error) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ success: false, message: error.message });
  }
};
