const { Op } = require("sequelize");
const { Student } = require("../models");

function normalizeAssignedStudentIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
  }
  return [];
}

function isStudentAssignedToAssignment(assignment, studentId) {
  const ids = normalizeAssignedStudentIds(assignment?.assigned_student_ids);
  if (!ids.length) return false;
  return ids.includes(String(studentId));
}

async function validateAndNormalizeAssignedStudentIds(studentIds, { curriculum_class_id, curriculum_class_level_id }) {
  const normalized = normalizeAssignedStudentIds(studentIds);
  if (!curriculum_class_id || !curriculum_class_level_id) {
    const err = new Error("Class and class level are required before assigning students.");
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

function pickStudentAssignmentSubmission(submissions) {
  if (!Array.isArray(submissions) || !submissions.length) return null;
  const drafts = submissions.filter((s) => s.status === "draft");
  if (drafts.length) {
    return drafts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  }
  return submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

function isAssignmentOpen(assignment) {
  if (!assignment || assignment.status !== "published" || !assignment.is_active) return false;
  if (assignment.due_date) {
    const dueMs = new Date(assignment.due_date).getTime();
    if (Number.isFinite(dueMs) && Date.now() > dueMs) return false;
  }
  return true;
}

module.exports = {
  normalizeAssignedStudentIds,
  isStudentAssignedToAssignment,
  validateAndNormalizeAssignedStudentIds,
  pickStudentAssignmentSubmission,
  isAssignmentOpen,
};
