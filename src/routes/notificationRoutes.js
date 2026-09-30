const express = require("express");
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} = require("../controllers/notificationController");
const { authenticateUser } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get("/", authenticateUser, listNotifications);
router.get("/unread-count", authenticateUser, unreadCount);
router.post("/read-all", authenticateUser, markAllRead);
router.patch("/:id/read", authenticateUser, markRead);

router.use(errorHandler);

module.exports = router;
