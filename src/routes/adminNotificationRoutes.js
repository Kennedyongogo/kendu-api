const express = require("express");
const router = express.Router();
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const {
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} = require("../controllers/adminNotificationController");
const { errorHandler } = require("../middleware/errorHandler");

router.use(authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES));

router.get("/", listAdminNotifications);
router.patch("/:id/read", markAdminNotificationRead);
router.post("/mark-all-read", markAllAdminNotificationsRead);

router.use(errorHandler);

module.exports = router;
