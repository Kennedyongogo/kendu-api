const express = require("express");
const router = express.Router();
const { getHrAttendanceOverview } = require("../controllers/schoolReportsController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.get(
  "/hr-attendance-overview",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getHrAttendanceOverview
);

router.use(errorHandler);

module.exports = router;
