const express = require("express");
const router = express.Router();
const {
  listTeachers,
  listTeacherUsersWithoutProfile,
  getTeacher,
  getMyTeacherProfile,
  createTeacher,
  updateTeacher,
  deleteTeacher,
} = require("../controllers/teacherController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { uploadTeacherProfilePicture, handleUploadError } = require("../middleware/upload");

const { ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");

/**
 * Teachers: many-to-many links (UUID arrays on POST / PUT :id when provided)
 * - department_ids — departments this teacher belongs to
 * - curriculum_ids — curricula they teach
 * - curriculum_class_ids — curriculum class groups they teach (many; junction)
 * - curriculum_subject_ids — curriculum subject offerings they teach
 * Homeroom (class teacher): at most one curriculum class per teacher
 * - is_class_teacher — boolean; when false, homeroom FK is cleared
 * - class_teacher_curriculum_class_id — required when is_class_teacher is true
 *
 * POST / PUT : optional multipart field teacher_profile_picture; array fields may be JSON strings when using FormData.
 * POST / : prefer user_id to link an existing teacher-role user; otherwise username/email/password/full_name create a new user.
 */
router.get("/me", authenticateUser, authorizeRoles(["teacher"]), getMyTeacherProfile);
router.get("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listTeachers);
router.get(
  "/users-without-profile",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listTeacherUsersWithoutProfile
);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), uploadTeacherProfilePicture, handleUploadError, createTeacher);
router.get("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getTeacher);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), uploadTeacherProfilePicture, handleUploadError, updateTeacher);
/**
 * DELETE removes the teacher profile (FK-safe). The user account is kept by default.
 * To also remove the login user: ?delete_user_account=true (or keep_user=false).
 */
router.delete("/:id", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), deleteTeacher);

router.use(errorHandler);

module.exports = router;
