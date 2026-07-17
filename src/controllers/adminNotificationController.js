const { InAppNotification } = require("../models");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

function formatNotification(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    title: j.title,
    message: j.message,
    type: j.type,
    action_url: j.action_url,
    is_read: !!j.is_read,
    read_at: j.read_at,
    created_at: j.created_at,
  };
}

exports.listAdminNotifications = async (req, res) => {
  try {
    if (!ADMIN_PORTAL_API_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }
    const unreadCount = await InAppNotification.count({
      where: { user_id: userId, is_read: false },
    });
    const notifications = await InAppNotification.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 80,
    });

    return res.json({
      success: true,
      data: {
        unread_count: unreadCount,
        notifications: notifications.map(formatNotification),
      },
    });
  } catch (error) {
    console.error("[admin] listAdminNotifications:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not load notifications." });
  }
};

exports.markAdminNotificationRead = async (req, res) => {
  try {
    const row = await InAppNotification.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    await row.update({ is_read: true, read_at: new Date() });
    return res.json({ success: true, data: formatNotification(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllAdminNotificationsRead = async (req, res) => {
  try {
    const [updated] = await InAppNotification.update(
      { is_read: true, read_at: new Date() },
      { where: { user_id: req.user.id, is_read: false } }
    );
    return res.json({ success: true, data: { updated } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
