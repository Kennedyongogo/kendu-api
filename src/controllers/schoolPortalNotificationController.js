const { InAppNotification, Student, LiveClass } = require("../models");
const { isLessonVisibleToStudent } = require("../services/liveClassAudience");

const PORTAL_LIVE_CLASS_RE = /\/portal\/live-class\/([0-9a-f-]{36})/i;

async function notificationVisibleToStudent(student, notification) {
  if (!student) return true;
  const url = String(notification?.action_url || "").trim();
  const match = url.match(PORTAL_LIVE_CLASS_RE);
  if (!match) return true;

  const live = await LiveClass.findByPk(match[1], {
    attributes: ["id", "curriculum_class_timetable_lesson_id"],
  });
  const lessonId = live?.curriculum_class_timetable_lesson_id;
  if (!lessonId) return false;
  return isLessonVisibleToStudent(student, lessonId);
}

async function filterNotificationsForUser(user, notifications) {
  if (user?.role !== "student" || !notifications?.length) return notifications;

  const student = await Student.findOne({
    where: { user_id: user.id },
    attributes: ["id", "curriculum_class_id", "curriculum_class_level_id"],
  });
  if (!student) return [];

  const visible = [];
  for (const row of notifications) {
    const json = row.toJSON ? row.toJSON() : row;
    if (await notificationVisibleToStudent(student, json)) {
      visible.push(row);
    }
  }
  return visible;
}

exports.listSchoolPortalNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await InAppNotification.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 50,
    });
    const visible = await filterNotificationsForUser(req.user, notifications);
    const unreadCount = visible.filter((n) => !n.is_read).length;
    return res.json({
      success: true,
      data: {
        unread_count: unreadCount,
        notifications: visible,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markSchoolPortalNotificationRead = async (req, res) => {
  try {
    const row = await InAppNotification.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    await row.update({ is_read: true, read_at: new Date() });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllSchoolPortalNotificationsRead = async (req, res) => {
  try {
    const [n] = await InAppNotification.update(
      { is_read: true, read_at: new Date() },
      { where: { user_id: req.user.id, is_read: false } }
    );
    return res.json({ success: true, data: { updated: n } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
