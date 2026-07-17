const { Op } = require("sequelize");
const { Student } = require("../models");

function normalizeAssignedStudentIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
  }
  return [];
}

function isStudentAssignedToExam(exam, studentId) {
  const ids = normalizeAssignedStudentIds(exam?.assigned_student_ids);
  if (!ids.length) return false;
  return ids.includes(String(studentId));
}

function isWithinExamScheduleWindow(examOrSchedule) {
  const row = examOrSchedule || {};
  const now = Date.now();
  const startMs = row.start_time ? new Date(row.start_time).getTime() : null;
  const endMs = row.end_time ? new Date(row.end_time).getTime() : null;
  if (Number.isFinite(startMs) && now < startMs) return false;
  if (Number.isFinite(endMs) && now > endMs) return false;
  return true;
}

function isBeforeExamScheduleStart(examOrSchedule) {
  const row = examOrSchedule || {};
  const startMs = row.start_time ? new Date(row.start_time).getTime() : null;
  return Number.isFinite(startMs) && Date.now() < startMs;
}

async function validateAndNormalizeAssignedStudentIds(studentIds, { curriculum_class_id, curriculum_class_level_id }) {
  const normalized = normalizeAssignedStudentIds(studentIds);
  if (!curriculum_class_id || !curriculum_class_level_id) {
    const err = new Error("Class and class level are required before assigning students to an exam.");
    err.statusCode = 400;
    throw err;
  }
  if (!normalized.length) return [];

  const students = await Student.findAll({
    where: {
      id: { [Op.in]: normalized },
      curriculum_class_id,
      curriculum_class_level_id,
    },
    attributes: ["id"],
  });
  const found = new Set(students.map((s) => String(s.id)));
  const invalid = normalized.filter((id) => !found.has(id));
  if (invalid.length) {
    const err = new Error("One or more selected students are not in the chosen class and level.");
    err.statusCode = 400;
    throw err;
  }
  return normalized;
}

function pickStudentExamSubmission(submissions) {
  if (!Array.isArray(submissions) || !submissions.length) return null;
  const drafts = submissions.filter((s) => s.status === "draft");
  if (drafts.length) {
    return drafts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }
  return submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

function indexSubmissionsByExam(submissions) {
  const byExam = new Map();
  for (const s of submissions || []) {
    const key = s.exam_id;
    if (!byExam.has(key)) byExam.set(key, []);
    byExam.get(key).push(s);
  }
  const preferred = new Map();
  for (const [examId, list] of byExam.entries()) {
    preferred.set(examId, pickStudentExamSubmission(list));
  }
  return preferred;
}

module.exports = {
  normalizeAssignedStudentIds,
  isStudentAssignedToExam,
  isWithinExamScheduleWindow,
  isBeforeExamScheduleStart,
  validateAndNormalizeAssignedStudentIds,
  pickStudentExamSubmission,
  indexSubmissionsByExam,
};
