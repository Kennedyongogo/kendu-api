const express = require("express");
const {
  listUnits,
  getUnitById,
  createUnit,
  updateUnit,
  submitUnit,
  approveUnit,
  rejectUnit,
  deleteUnit,
  listAssignableProgrammes,
  listDepartmentRoster,
  listAvailableUnitsForStudent,
  listMyRegistrations,
  registerForUnit,
  dropUnitRegistration,
} = require("../controllers/unitController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
  SCHOOL_ADMIN_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const portalStaff = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

// Static paths before /:id
router.get("/assignable-programmes", ...portalStaff, listAssignableProgrammes);
router.get("/department-roster", ...portalStaff, listDepartmentRoster);
router.get("/student/available", ...studentsOnly, listAvailableUnitsForStudent);
router.get("/student/registrations", ...studentsOnly, listMyRegistrations);
router.post("/registrations/:registrationId/drop", ...studentsOnly, dropUnitRegistration);

router.get("/", ...portalStaff, listUnits);
router.post("/", ...portalStaff, createUnit);
router.get("/:id", ...portalStaff, getUnitById);
router.put("/:id", ...portalStaff, updateUnit);
router.post("/:id/submit", ...portalStaff, submitUnit);
router.post("/:id/approve", ...adminOnly, approveUnit);
router.post("/:id/reject", ...adminOnly, rejectUnit);
router.post("/:id/register", ...studentsOnly, registerForUnit);
router.delete("/:id", ...portalStaff, deleteUnit);

router.use(errorHandler);

module.exports = router;
