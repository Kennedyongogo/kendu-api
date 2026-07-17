const express = require("express");
const router = express.Router();
const {
  listStudentExamResults,
  getStudentExamResult,
  createStudentExamResult,
  updateStudentExamResult,
  deleteStudentExamResult,
  syncFromExamAttempt,
} = require("../controllers/studentExamResultController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.post(
  "/sync-from-exam-attempt/:attemptId",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  syncFromExamAttempt
);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listStudentExamResults);
router.post("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), createStudentExamResult);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getStudentExamResult);
router.put("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), updateStudentExamResult);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteStudentExamResult);

router.use(errorHandler);

module.exports = router;
