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
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const canManage = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];

router.get("/programmes", ...canManage, listProgrammes);
router.get("/programmes/:programmeId/years", ...canManage, listYears);
router.get("/programmes/:programmeId/years/:year/semesters", ...canManage, listSemesters);
router.get("/programmes/:programmeId/years/:year/register", ...canManage, listRegister);
router.post("/register/backfill", ...adminOnly, backfillRegister);
router.post("/students/move-bulk", ...canManage, moveStudentsBulk);
router.post("/students/:studentId/move", ...canManage, moveStudent);

router.use(errorHandler);

module.exports = router;
