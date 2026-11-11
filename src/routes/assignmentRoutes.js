const express = require("express");
const {
  listAssignments,
  summaryAssignments,
  listMyAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} = require("../controllers/assignmentController");
const {
  authenticateUser,
  authorizeRoles,
  READ_ASSIGNMENT_ROLES,
  WRITE_ASSIGNMENT_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const canView = [authenticateUser, authorizeRoles(READ_ASSIGNMENT_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_ASSIGNMENT_ROLES)];

router.get(
  "/me",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  listMyAssignments
);
router.get("/summary", ...canView, summaryAssignments);
router.get("/", ...canView, listAssignments);
router.get("/:id", ...canView, getAssignmentById);
router.post("/", ...canWrite, createAssignment);
router.put("/:id", ...canWrite, updateAssignment);
router.delete("/:id", ...canWrite, deleteAssignment);

router.use(errorHandler);

module.exports = router;
