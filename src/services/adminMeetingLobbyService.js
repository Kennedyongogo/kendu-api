const { AdminMeetingLobbyEntry, User, AdminMeeting } = require("../models");
const { emitToMeeting, emitToUser } = require("./adminMeetingRealtime");
const { minutesFromLobbyRow } = require("../utils/eventAttendanceMinutes");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatEntry(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    meeting_id: j.meeting_id,
    user_id: j.user_id,
    status: j.status,
    requested_at: j.requested_at,
    admitted_at: j.admitted_at,
    admitted_by: j.admitted_by,
    denied_at: j.denied_at,
    denied_by: j.denied_by,
    left_at: j.left_at,
    minutes_in_event: minutesFromLobbyRow(j),
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
          email: j.user.email,
          role: j.user.role,
        }
      : null,
    admitted_by_user: j.admitted_by_user
      ? {
          id: j.admitted_by_user.id,
          full_name: j.admitted_by_user.full_name,
          username: j.admitted_by_user.username,
        }
      : null,
  };
}

/** Lobby status exposed to clients (never treat stale admitted rows as active). */
function resolveAttendeeLobbyStatus(entry, meeting) {
  if (!entry) return "none";
  const status = String(entry.status || "").toLowerCase();
  const session = String(meeting?.session_status || meeting?.status || "").toLowerCase();
  if (status === "admitted") {
    if (entry.left_at) return "left";
    if (session === "ended" || session === "cancelled") return "left";
    return "admitted";
  }
  return status;
}

function buildStats(entries) {
  return {
    total_requests: entries.length,
    waiting: entries.filter((e) => e.status === "waiting").length,
    in_event: entries.filter((e) => e.status === "admitted").length,
    left_after_admit: entries.filter((e) => e.status === "left").length,
    denied: entries.filter((e) => e.status === "denied").length,
    ever_admitted: entries.filter((e) => e.admitted_at).length,
  };
}

async function loadLobbyEntries(meetingId) {
  const rows = await AdminMeetingLobbyEntry.findAll({
    where: { meeting_id: meetingId },
    include: [
      { model: User, as: "user", ...userSafe },
      { model: User, as: "admitted_by_user", ...userSafe, required: false },
    ],
    order: [["status", "ASC"], ["requested_at", "ASC"]],
  });
  return rows.map(formatEntry);
}

async function markMeetingLiveIfNeeded(meetingId) {
  const m = await AdminMeeting.findByPk(meetingId);
  if (m?.session_status === "scheduled") {
    await m.update({ session_status: "live", status: "live" });
  }
}

async function broadcastLobby(meetingId) {
  const entries = await loadLobbyEntries(meetingId);
  const payload = {
    meeting_id: meetingId,
    stats: buildStats(entries),
    waiting: entries.filter((e) => e.status === "waiting"),
    admitted: entries.filter((e) => e.status === "admitted"),
    left: entries.filter((e) => e.status === "left"),
    denied: entries.filter((e) => e.status === "denied"),
    all: entries,
  };
  emitToMeeting(meetingId, "admin-meeting-lobby:update", payload);
  return payload;
}

module.exports = {
  formatEntry,
  buildStats,
  resolveAttendeeLobbyStatus,
  loadLobbyEntries,
  markMeetingLiveIfNeeded,
  broadcastLobby,
  emitToUser,
};
