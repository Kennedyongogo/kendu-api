const express = require("express");
const {
  listPeriods,
  getPeriod,
  createPeriod,
  updatePeriod,
  deletePeriod,
  submitPeriod,
  approvePeriod,
  rejectPeriod,
  createSlot,
  updateSlot,
  deleteSlot,
  downloadPeriodPdf,
  getMyExamTimetable,
  downloadMyExamTimetablePdf,
  downloadMyExamCardPdf,
} = require("../controllers/examTimetableController");
const {
  authenticateUser,
  authorizeRoles,
  READ_EXAM_ROLES,
  WRITE_EXAM_ROLES,
  APPROVE_EXAM_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const canRead = [authenticateUser, authorizeRoles(READ_EXAM_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_EXAM_ROLES)];
const canApprove = [authenticateUser, authorizeRoles(APPROVE_EXAM_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

// Exam periods (plans)
router.get("/me", ...studentsOnly, getMyExamTimetable);
router.get("/me/pdf", ...studentsOnly, downloadMyExamTimetablePdf);
router.get("/me/card/pdf", ...studentsOnly, downloadMyExamCardPdf);
router.get("/", ...canRead, listPeriods);
router.post("/", ...canWrite, createPeriod);
router.get("/:id/pdf", ...canRead, downloadPeriodPdf);
router.get("/:id", ...canRead, getPeriod);
router.put("/:id", ...canWrite, updatePeriod);
router.delete("/:id", ...canWrite, deletePeriod);

// Approval workflow
router.post("/:id/submit", ...canWrite, submitPeriod);
router.post("/:id/approve", ...canApprove, approvePeriod);
router.post("/:id/reject", ...canApprove, rejectPeriod);

// Slots inside a period
router.post("/:id/slots", ...canWrite, createSlot);
router.put("/:id/slots/:slotId", ...canWrite, updateSlot);
router.delete("/:id/slots/:slotId", ...canWrite, deleteSlot);

router.use(errorHandler);

module.exports = router;
