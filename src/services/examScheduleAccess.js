const { Exam, Student, Teacher } = require("../models");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const { isStudentAssignedToExam } = require("../utils/examAssignedStudents");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

function isStaffRole(req) {
  return TEACH_OR_STAFF.includes(req.user?.role);
}

function isTeacherRole(req) {
  return req.user?.role === "teacher" || ADMIN_PORTAL_API_ROLES.includes(req.user?.role);
}

async function loadExamForAccess(examId) {
  return Exam.findByPk(examId, {
    attributes: [
      "id",
      "title",
      "curriculum_class_id",
      "teacher_id",
      "start_time",
      "end_time",
      "session_status",
      "status",
      "is_active",
      "meeting_id",
      "meeting_provider",
      "meeting_join_url",
      "meeting_host_url",
      "proctoring_mode",
      "requires_webcam",
      "assigned_student_ids",
      "curriculum_class_level_id",
    ],
  });
}

/** @deprecated use loadExamForAccess */
const loadExamScheduleForAccess = loadExamForAccess;

async function assertCanAccessExam(req, exam) {
  if (!exam) {
    const err = new Error("Exam not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!exam.is_active) {
    const err = new Error("This exam is inactive.");
    err.statusCode = 400;
    throw err;
  }
  if (isStaffRole(req)) {
    if (req.user?.role === "teacher" && exam.teacher_id) {
      const teacher = await Teacher.findOne({ where: { user_id: req.user.id }, attributes: ["id"] });
      if (teacher && String(exam.teacher_id) !== String(teacher.id)) {
        const err = new Error("Forbidden: this exam is assigned to another invigilator.");
        err.statusCode = 403;
        throw err;
      }
    }
    return;
  }
  if (req.user?.role !== "student") {
    const err = new Error("Forbidden.");
    err.statusCode = 403;
    throw err;
  }
  const student = await Student.findOne({
    where: { user_id: req.user.id },
    attributes: ["id", "curriculum_class_id", "curriculum_class_level_id"],
  });
  if (!student) {
    const err = new Error("Student profile not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!exam.curriculum_class_id || String(student.curriculum_class_id) !== String(exam.curriculum_class_id)) {
    const err = new Error("You are not enrolled in the class for this exam.");
    err.statusCode = 403;
    throw err;
  }
  if (
    exam.curriculum_class_level_id &&
    student.curriculum_class_level_id &&
    String(student.curriculum_class_level_id) !== String(exam.curriculum_class_level_id)
  ) {
    const err = new Error("You are not enrolled in the level for this exam.");
    err.statusCode = 403;
    throw err;
  }
  if (!isStudentAssignedToExam(exam, student.id)) {
    const err = new Error("You are not assigned to this exam.");
    err.statusCode = 403;
    throw err;
  }
}

/** @deprecated use assertCanAccessExam */
const assertCanAccessExamSchedule = assertCanAccessExam;

module.exports = {
  loadExamForAccess,
  loadExamScheduleForAccess,
  assertCanAccessExam,
  assertCanAccessExamSchedule,
  isStaffRole,
  isTeacherRole,
};
