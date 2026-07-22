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
  ADMIN_PORTAL_API_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  SCHOOL_ADMIN_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const canManage = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

// Exam periods (plans)
router.get("/me", ...studentsOnly, getMyExamTimetable);
router.get("/me/pdf", ...studentsOnly, downloadMyExamTimetablePdf);
router.get("/me/card/pdf", ...studentsOnly, downloadMyExamCardPdf);
router.get("/", ...canManage, listPeriods);
router.post("/", ...canManage, createPeriod);
router.get("/:id/pdf", ...canManage, downloadPeriodPdf);
router.get("/:id", ...canManage, getPeriod);
router.put("/:id", ...canManage, updatePeriod);
router.delete("/:id", ...canManage, deletePeriod);

// Approval workflow
router.post("/:id/submit", ...canManage, submitPeriod);
router.post("/:id/approve", ...adminOnly, approvePeriod);
router.post("/:id/reject", ...adminOnly, rejectPeriod);

// Slots inside a period
router.post("/:id/slots", ...canManage, createSlot);
router.put("/:id/slots/:slotId", ...canManage, updateSlot);
router.delete("/:id/slots/:slotId", ...canManage, deleteSlot);

router.use(errorHandler);

module.exports = router;
