const express = require("express");
const router = express.Router();
const {
  getPublicSchoolInfo,
  getFullSchoolSettings,
  updateSchoolProfile,
} = require("../controllers/schoolProfileController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { uploadSchoolLogos, handleUploadError } = require("../middleware/upload");

const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.get("/", getPublicSchoolInfo);
router.get("/admin", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getFullSchoolSettings);
router.put(
  "/",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  uploadSchoolLogos,
  updateSchoolProfile
);

router.use(handleUploadError);
router.use(errorHandler);

module.exports = router;
