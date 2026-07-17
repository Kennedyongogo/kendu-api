const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/dashboardController");
const { authenticateUser, authorizeRoles, ADMIN_PORTAL_API_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

router.get(
  "/stats",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getDashboardStats
);

router.use(errorHandler);

module.exports = router;
