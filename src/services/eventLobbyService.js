const { EventLobbyEntry, Student, Parent, User, SchoolEvent } = require("../models");
const { emitToEvent, emitToUser } = require("./eventRealtime");
const { minutesFromLobbyRow } = require("../utils/eventAttendanceMinutes");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatEntry(row) {
  const j = row.toJSON ? row.toJSON() : row;
  const minsInEvent = minutesFromLobbyRow(j);
  return {
    id: j.id,
    event_id: j.event_id,
    user_id: j.user_id,
    student_id: j.student_id,
    parent_id: j.parent_id,
    status: j.status,
    requested_at: j.requested_at,
    admitted_at: j.admitted_at,
    admitted_by: j.admitted_by,
    denied_at: j.denied_at,
    denied_by: j.denied_by,
    left_at: j.left_at,
    minutes_in_event: minsInEvent,
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
          email: j.user.email,
          role: j.user.role,
        }
      : null,
    student: j.student
      ? { id: j.student.id, admission_number: j.student.admission_number }
      : null,
    parent: j.parent ? { id: j.parent.id } : null,
    admitted_by_user: j.admitted_by_user
      ? {
          id: j.admitted_by_user.id,
          full_name: j.admitted_by_user.full_name,
          username: j.admitted_by_user.username,
        }
      : null,
  };
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

async function loadLobbyEntries(eventId) {
  const rows = await EventLobbyEntry.findAll({
    where: { event_id: eventId },
    include: [
      { model: User, as: "user", ...userSafe },
      { model: Student, as: "student", attributes: ["id", "admission_number"], required: false },
      { model: Parent, as: "parent", attributes: ["id"], required: false },
      { model: User, as: "admitted_by_user", ...userSafe, required: false },
    ],
    order: [
      ["status", "ASC"],
      ["requested_at", "ASC"],
    ],
  });
  return rows.map(formatEntry);
}

async function markEventLiveIfNeeded(eventId) {
  const ev = await SchoolEvent.findByPk(eventId);
  if (ev?.session_status === "scheduled") {
    await ev.update({ session_status: "live" });
  }
}

async function broadcastLobby(eventId) {
  const entries = await loadLobbyEntries(eventId);
  const payload = {
    event_id: eventId,
    stats: buildStats(entries),
    waiting: entries.filter((e) => e.status === "waiting"),
    admitted: entries.filter((e) => e.status === "admitted"),
    left: entries.filter((e) => e.status === "left"),
    denied: entries.filter((e) => e.status === "denied"),
    all: entries,
  };
  emitToEvent(eventId, "event-lobby:update", payload);
  return payload;
}

module.exports = {
  formatEntry,
  buildStats,
  loadLobbyEntries,
  markEventLiveIfNeeded,
  broadcastLobby,
  emitToUser,
};
