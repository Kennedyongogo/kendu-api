const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  exportDashboardReport,
} = require("../controllers/dashboardController");
const { authenticateUser, authorizeRoles, DASHBOARD_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

router.get(
  "/stats",
  authenticateUser,
  authorizeRoles(DASHBOARD_ROLES),
  getDashboardStats
);

router.get(
  "/report.pdf",
  authenticateUser,
  authorizeRoles(DASHBOARD_ROLES),
  exportDashboardReport
);

router.use(errorHandler);

module.exports = router;
