const express = require("express");
const router = express.Router();
const {
  listProctoringEvents,
  getProctoringEvent,
  createProctoringEvent,
  updateProctoringEvent,
  deleteProctoringEvent,
} = require("../controllers/proctoringEventController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { checkStudentAccountAccess } = require("../middleware/checkStudentAccountAccess");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];
const WITH_STUDENT = [...TEACH_OR_STAFF, "student"];

router.get("/", authenticateUser, checkStudentAccountAccess, authorizeRoles(WITH_STUDENT), listProctoringEvents);
router.post("/", authenticateUser, checkStudentAccountAccess, authorizeRoles(WITH_STUDENT), createProctoringEvent);
router.get("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(WITH_STUDENT), getProctoringEvent);
router.put("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateProctoringEvent);
router.delete("/:id", authenticateUser, checkStudentAccountAccess, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteProctoringEvent);

router.use(errorHandler);

module.exports = router;
