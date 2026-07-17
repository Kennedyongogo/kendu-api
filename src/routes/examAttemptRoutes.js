const express = require("express");
const router = express.Router();
const {
  listExamAttempts,
  getExamAttempt,
  createExamAttempt,
  updateExamAttempt,
  deleteExamAttempt,
} = require("../controllers/examAttemptController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { checkStudentAccountAccess } = require("../middleware/checkStudentAccountAccess");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher", "student"];

router.get("/", authenticateUser, checkStudentAccountAccess, authorizeRoles(TEACH_OR_STAFF), listExamAttempts);
router.post("/", authenticateUser, checkStudentAccountAccess, authorizeRoles([...STAFF_ROLES, "teacher", "student"]), createExamAttempt);
router.get("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(TEACH_OR_STAFF), getExamAttempt);
router.put("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles([...STAFF_ROLES, "teacher", "student"]), updateExamAttempt);
router.delete("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteExamAttempt);

router.use(errorHandler);

module.exports = router;
