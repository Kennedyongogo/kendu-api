const express = require("express");
const router = express.Router();
const {
  listExamQuestions,
  getExamQuestion,
  createExamQuestion,
  updateExamQuestion,
  deleteExamQuestion,
} = require("../controllers/examQuestionController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listExamQuestions);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createExamQuestion);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getExamQuestion);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateExamQuestion);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteExamQuestion);

router.use(errorHandler);

module.exports = router;
