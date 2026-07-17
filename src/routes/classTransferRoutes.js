const express = require("express");
const router = express.Router();
const {
  listClassTransferCurricula,
  listClassTransferClasses,
  listClassTransferLevels,
  listClassTransferLevelStudents,
  moveClassTransferStudent,
  moveClassTransferStudentsBulk,
  listClassPlacementRegister,
  backfillPlacementRegister,
} = require("../controllers/classTransferController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.get("/curricula", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listClassTransferCurricula);
router.get(
  "/curricula/:curriculumId/classes",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listClassTransferClasses
);
router.get(
  "/classes/:classId/levels",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listClassTransferLevels
);
router.get(
  "/classes/:classId/levels/:levelId/students",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listClassTransferLevelStudents
);
router.get(
  "/classes/:classId/placement-register",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listClassPlacementRegister
);
router.post(
  "/placement-register/backfill",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  backfillPlacementRegister
);
router.post(
  "/students/move-bulk",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  moveClassTransferStudentsBulk
);
router.post(
  "/students/:studentId/move",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  moveClassTransferStudent
);

module.exports = router;
