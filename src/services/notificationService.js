const { Notification } = require("../models");

/**
 * Stores in-app notifications. Never throws: a failed notification must not undo the
 * action (e.g. a booking) that triggered it.
 * @param {string|string[]} userIds
 * @param {{ type: string, title: string, body?: string, data?: object }} payload
 */
async function notify(userIds, payload, { transaction } = {}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  try {
    await Notification.bulkCreate(
      ids.map((user_id) => ({
        user_id,
        type: payload.type,
        title: String(payload.title || "").slice(0, 150),
        body: payload.body || null,
        data: payload.data || null,
      })),
      { transaction }
    );
  } catch (error) {
    console.error("Failed to store notification:", error.message);
  }
}

module.exports = { notify };
