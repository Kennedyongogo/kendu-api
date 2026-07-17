const express = require("express");
const router = express.Router();
const {
  listSchoolAdmins,
  getSchoolAdmin,
  getMySchoolAdminProfile,
  createSchoolAdmin,
  updateSchoolAdmin,
  deleteSchoolAdmin,
  listUsersWithoutSchoolAdminProfile,
} = require("../controllers/schoolAdminController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { uploadSchoolAdminProfilePicture, handleUploadError } = require("../middleware/upload");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");

router.get("/me", authenticateUser, authorizeRoles(STAFF_ROLES), getMySchoolAdminProfile);
router.get("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listSchoolAdmins);
router.get("/users-without-profile", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listUsersWithoutSchoolAdminProfile);
router.post("/", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), uploadSchoolAdminProfilePicture, handleUploadError, createSchoolAdmin);
router.get("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getSchoolAdmin);
router.put("/:id", authenticateUser, authorizeRoles(STAFF_ROLES), uploadSchoolAdminProfilePicture, handleUploadError, updateSchoolAdmin);
/**
 * DELETE removes the school admin profile (FK-safe). The user account is kept by default.
 * To also remove the login user: ?delete_user_account=true (or keep_user=false).
 */
router.delete("/:id", authenticateUser, authorizeRoles(STAFF_ROLES), deleteSchoolAdmin);

router.use(errorHandler);

module.exports = router;
