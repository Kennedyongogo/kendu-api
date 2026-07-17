const express = require("express");
const router = express.Router();
const {
  listExamTemplates,
  getExamTemplate,
  createExamTemplate,
  updateExamTemplate,
  deleteExamTemplate,
  duplicateExamTemplate,
} = require("../controllers/examTemplateController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listExamTemplates);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createExamTemplate);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getExamTemplate);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateExamTemplate);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteExamTemplate);
router.post("/:id/duplicate", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), duplicateExamTemplate);

router.use(errorHandler);

module.exports = router;
