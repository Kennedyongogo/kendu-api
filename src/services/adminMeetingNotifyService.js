const { Op } = require("sequelize");
const { User, InAppNotification } = require("../models");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const { emitToUser } = require("./adminMeetingRealtime");

function buildMeetingJoinPath(meetingId) {
  return `/live/meeting/${meetingId}`;
}

function formatMeetingWhen(meeting) {
  const start = meeting.start_time ? new Date(meeting.start_time) : null;
  const end = meeting.end_time ? new Date(meeting.end_time) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const dateOpts = { dateStyle: "medium", timeStyle: "short" };
  const startLabel = start.toLocaleString(undefined, dateOpts);
  if (!end || Number.isNaN(end.getTime())) return startLabel;
  const endLabel = end.toLocaleString(undefined, { timeStyle: "short" });
  return `${startLabel} – ${endLabel}`;
}

function formatNotificationRow(row) {
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

/**
 * Notify all active admin-portal staff about a scheduled meeting (never the meeting host).
 * @returns {Promise<{ staff_targeted: number, in_app_notifications_created: number, errors?: object[] }>}
 */
async function notifyStaffAboutMeeting(meeting, { note = "", excludeUserIds = [], creatorName = "" } = {}) {
  const joinPath = buildMeetingJoinPath(meeting.id);
  const when = formatMeetingWhen(meeting);
  const host = creatorName ? String(creatorName).trim() : "A colleague";
  const title = `Staff meeting: ${meeting.title}`;
  let message =
    `${host} invited you to a staff meeting.` +
    (when ? `\n\nWhen: ${when}` : "") +
    `\n\nJoin from Elimu Plus Online → Staff meetings, or open the meeting link in the admin app.`;
  const noteText = note != null ? String(note).trim().slice(0, 2000) : "";
  if (noteText) message += `\n\n${noteText}`;

  const exclude = new Set((excludeUserIds || []).map((id) => String(id)).filter(Boolean));
  if (meeting?.created_by) exclude.add(String(meeting.created_by));

  const where = {
    role: { [Op.in]: ADMIN_PORTAL_API_ROLES },
    is_active: true,
  };
  if (exclude.size) {
    where.id = { [Op.notIn]: [...exclude] };
  }

  const users = await User.findAll({ where, attributes: ["id"] });

  let created = 0;
  const errors = [];

  for (const user of users) {
    try {
      const row = await InAppNotification.create({
        user_id: user.id,
        title,
        message,
        type: "info",
        action_url: joinPath.length > 500 ? joinPath.slice(0, 500) : joinPath,
      });
      const notification = formatNotificationRow(row);
      emitToUser(user.id, "admin-notification:new", { notification });
      emitToUser(user.id, "admin-meeting:scheduled", {
        meeting_id: meeting.id,
        title: meeting.title,
        join_path: joinPath,
        when,
      });
      created += 1;
    } catch (err) {
      errors.push({ user_id: user.id, message: err.message });
    }
  }

  return {
    staff_targeted: users.length,
    in_app_notifications_created: created,
    join_path: joinPath,
    errors: errors.length ? errors : undefined,
  };
}

module.exports = {
  buildMeetingJoinPath,
  notifyStaffAboutMeeting,
};
