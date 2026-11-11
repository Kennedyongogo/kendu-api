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
  SCHOOL_ADMIN_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  READ_REGISTRATION_ROLES,
  WRITE_REGISTRATION_ROLES,
  READ_UNIT_ROLES,
  WRITE_UNIT_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canReadUnits = [authenticateUser, authorizeRoles(READ_UNIT_ROLES)];
const canWriteUnits = [authenticateUser, authorizeRoles(WRITE_UNIT_ROLES)];
const canReadRegistrations = [authenticateUser, authorizeRoles(READ_REGISTRATION_ROLES)];
const canWriteRegistrations = [authenticateUser, authorizeRoles(WRITE_REGISTRATION_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

// Static paths before /:id
router.get("/assignable-programmes", ...canReadUnits, listAssignableProgrammes);
router.get("/department-roster", ...canReadRegistrations, listDepartmentRoster);
router.get("/student/available", ...studentsOnly, listAvailableUnitsForStudent);
router.get("/student/registrations", ...studentsOnly, listMyRegistrations);
router.post("/registrations/:registrationId/drop", ...canWriteRegistrations, dropUnitRegistration);

router.get("/", ...canReadUnits, listUnits);
router.post("/", ...canWriteUnits, createUnit);
router.get("/:id", ...canReadUnits, getUnitById);
router.put("/:id", ...canWriteUnits, updateUnit);
router.post("/:id/submit", ...canWriteUnits, submitUnit);
router.post("/:id/approve", ...adminOnly, approveUnit);
router.post("/:id/reject", ...adminOnly, rejectUnit);
router.post("/:id/register", ...canWriteRegistrations, registerForUnit);
router.delete("/:id", ...canWriteUnits, deleteUnit);

router.use(errorHandler);

module.exports = router;
