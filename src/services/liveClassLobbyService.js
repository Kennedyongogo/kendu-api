const {
  LiveClassLobbyEntry,
  LiveClassAttendance,
  Student,
  User,
  LiveClass,
} = require("../models");
const { emitToLiveClass, emitToUser } = require("./liveClassRealtime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatEntry(row) {
  const j = row.toJSON ? row.toJSON() : row;
  const minsInClass =
    j.status === "admitted" && j.admitted_at
      ? Math.max(
          0,
          Math.round(
            ((j.left_at ? new Date(j.left_at) : new Date()).getTime() - new Date(j.admitted_at).getTime()) / 60000
          )
        )
      : null;
  return {
    id: j.id,
    live_class_id: j.live_class_id,
    user_id: j.user_id,
    student_id: j.student_id,
    status: j.status,
    requested_at: j.requested_at,
    admitted_at: j.admitted_at,
    admitted_by: j.admitted_by,
    denied_at: j.denied_at,
    denied_by: j.denied_by,
    left_at: j.left_at,
    minutes_in_class: minsInClass,
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
          email: j.user.email,
        }
      : null,
    student: j.student
      ? {
          id: j.student.id,
          admission_number: j.student.admission_number,
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

function buildStats(entries) {
  const waiting = entries.filter((e) => e.status === "waiting");
  const admitted = entries.filter((e) => e.status === "admitted");
  const left = entries.filter((e) => e.status === "left");
  const denied = entries.filter((e) => e.status === "denied");
  return {
    total_requests: entries.length,
    waiting: waiting.length,
    in_class: admitted.length,
    left_after_admit: left.length,
    denied: denied.length,
    ever_admitted: entries.filter((e) => e.admitted_at).length,
  };
}

async function loadLobbyEntries(liveClassId) {
  const rows = await LiveClassLobbyEntry.findAll({
    where: { live_class_id: liveClassId },
    include: [
      { model: User, as: "user", ...userSafe },
      { model: Student, as: "student", attributes: ["id", "admission_number"] },
      { model: User, as: "admitted_by_user", ...userSafe, required: false },
    ],
    order: [
      ["status", "ASC"],
      ["requested_at", "ASC"],
    ],
  });
  return rows.map(formatEntry);
}

async function recordAttendanceOnAdmit(liveClassId, studentId) {
  if (!studentId) return null;
  const now = new Date();
  const [row, created] = await LiveClassAttendance.findOrCreate({
    where: { live_class_id: liveClassId, student_id: studentId },
    defaults: {
      join_time: now,
      leave_time: null,
      duration_minutes: null,
      left_early: false,
    },
  });
  if (!created) {
    await row.update({
      join_time: now,
      leave_time: null,
      duration_minutes: null,
      left_early: false,
    });
    await row.reload();
  } else {
    await LiveClass.increment("attendance_count", { where: { id: liveClassId } });
  }
  const live = await LiveClass.findByPk(liveClassId);
  if (live?.session_status === "scheduled") {
    await live.update({ session_status: "live" });
  }
  return row;
}

async function recordAttendanceLeave(liveClassId, studentId) {
  if (!studentId) return;
  const row = await LiveClassAttendance.findOne({
    where: { live_class_id: liveClassId, student_id: studentId },
  });
  if (!row || row.leave_time) return;
  const leave = new Date();
  const joinTime = row.join_time ? new Date(row.join_time) : leave;
  const durationMinutes = Math.max(0, Math.round((leave.getTime() - joinTime.getTime()) / 60000));
  await row.update({ leave_time: leave, duration_minutes: durationMinutes });
}

async function broadcastLobby(liveClassId) {
  const entries = await loadLobbyEntries(liveClassId);
  const payload = {
    live_class_id: liveClassId,
    stats: buildStats(entries),
    waiting: entries.filter((e) => e.status === "waiting"),
    admitted: entries.filter((e) => e.status === "admitted"),
    left: entries.filter((e) => e.status === "left"),
    denied: entries.filter((e) => e.status === "denied"),
    all: entries,
  };
  emitToLiveClass(liveClassId, "live-lobby:update", payload);
  return payload;
}

module.exports = {
  formatEntry,
  buildStats,
  loadLobbyEntries,
  recordAttendanceOnAdmit,
  recordAttendanceLeave,
  broadcastLobby,
  emitToUser,
};
