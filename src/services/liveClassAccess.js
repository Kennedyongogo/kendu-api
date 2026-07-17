const { Student } = require("../models");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const {
  loadLiveClassForAccess,
  ensureLiveClassLessonLink,
  assertStudentCanAccessLiveClass,
} = require("./liveClassAudience");

async function assertCanAccessLiveClass(req, live) {
  if (!live) {
    const err = new Error("Live class not found");
    err.statusCode = 404;
    throw err;
  }

  if (ADMIN_PORTAL_API_ROLES.includes(req.user.role)) {
    return { role: "teacher" };
  }

  if (req.user.role !== "student") {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  const student = await Student.findOne({
    where: { user_id: req.user.id },
    attributes: ["id", "user_id", "curriculum_class_id", "curriculum_class_level_id", "curriculum_id"],
  });

  return assertStudentCanAccessLiveClass(student, live, { userId: req.user.id });
}

function isTeacherRole(req) {
  return ADMIN_PORTAL_API_ROLES.includes(req.user.role);
}

module.exports = {
  loadLiveClassForAccess,
  ensureLiveClassLessonLink,
  assertCanAccessLiveClass,
  isTeacherRole,
};
