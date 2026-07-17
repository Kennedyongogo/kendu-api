const express = require("express");
const router = express.Router();
const {
  listProctoringRecordings,
  getProctoringRecording,
  createProctoringRecording,
  updateProctoringRecording,
  deleteProctoringRecording,
  uploadRecordingChunk,
  uploadRecordingChunkMiddleware,
} = require("../controllers/proctoringRecordingController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { checkStudentAccountAccess } = require("../middleware/checkStudentAccountAccess");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];
const WITH_STUDENT = [...TEACH_OR_STAFF, "student"];

router.post(
  "/upload-chunk",
  authenticateUser,
  checkStudentAccountAccess,
  authorizeRoles(["student"]),
  uploadRecordingChunkMiddleware,
  uploadRecordingChunk
);

router.get("/", authenticateUser, checkStudentAccountAccess, authorizeRoles(WITH_STUDENT), listProctoringRecordings);
router.post("/", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), createProctoringRecording);
router.get("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(WITH_STUDENT), getProctoringRecording);
router.put("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateProctoringRecording);
router.delete("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteProctoringRecording);

router.use(errorHandler);

module.exports = router;
