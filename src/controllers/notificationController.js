const { Op } = require("sequelize");
const { Notification } = require("../models");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serialize(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    read: Boolean(n.read_at),
    read_at: n.read_at,
    created_at: n.created_at ?? n.createdAt,
  };
}

exports.listNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const where = { user_id: req.user.id };
    if (req.query.unread === "1" || req.query.unread === "true") where.read_at = null;

    const [{ count, rows }, unread] = await Promise.all([
      Notification.findAndCountAll({ where, order: [["created_at", "DESC"]], limit, offset }),
      Notification.count({ where: { user_id: req.user.id, read_at: null } }),
    ]);

    return res.json({
      success: true,
      data: { total: count, unread_count: unread, limit, offset, notifications: rows.map(serialize) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const unread = await Notification.count({ where: { user_id: req.user.id, read_at: null } });
    return res.json({ success: true, data: { unread_count: unread } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }
    const n = await Notification.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!n) return res.status(404).json({ success: false, message: "Notification not found." });
    if (!n.read_at) await n.update({ read_at: new Date() });
    return res.json({ success: true, data: serialize(n) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const [updated] = await Notification.update(
      { read_at: new Date() },
      { where: { user_id: req.user.id, read_at: { [Op.is]: null } } }
    );
    return res.json({ success: true, data: { updated } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
