const express = require("express");
const {
  listProgrammes,
  listYears,
  listSemesters,
  moveStudent,
  moveStudentsBulk,
  listRegister,
  backfillRegister,
} = require("../controllers/cohortTransferController");
const {
  authenticateUser,
  authorizeRoles,
  SCHOOL_ADMIN_ROLES,
  WRITE_REGISTRATION_ROLES,
  READ_REGISTRATION_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const canRead = [authenticateUser, authorizeRoles(READ_REGISTRATION_ROLES)];
const canManage = [authenticateUser, authorizeRoles(WRITE_REGISTRATION_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];

router.get("/programmes", ...canRead, listProgrammes);
router.get("/programmes/:programmeId/years", ...canRead, listYears);
router.get("/programmes/:programmeId/years/:year/semesters", ...canRead, listSemesters);
router.get("/programmes/:programmeId/years/:year/register", ...canRead, listRegister);
router.post("/register/backfill", ...adminOnly, backfillRegister);
router.post("/students/move-bulk", ...canManage, moveStudentsBulk);
router.post("/students/:studentId/move", ...canManage, moveStudent);

router.use(errorHandler);

module.exports = router;
