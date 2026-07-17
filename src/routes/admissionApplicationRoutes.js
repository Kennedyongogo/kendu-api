const express = require("express");
const router = express.Router();
const {
  submitPublicApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  uploadDocuments,
} = require("../controllers/admissionApplicationController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { uploadAdmissionDocuments, handleUploadError } = require("../middleware/upload");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.post("/submit", submitPublicApplication);
router.post("/upload", uploadAdmissionDocuments, handleUploadError, uploadDocuments);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listApplications);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getApplication);
router.put("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), updateApplication);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteApplication);

router.use(errorHandler);

module.exports = router;
