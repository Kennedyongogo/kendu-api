const { ExamScheduleLobbyEntry, Exam, Student, User } = require("../models");
const { emitToExamSchedule, emitToUser } = require("./examScheduleRealtime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatEntry(row) {
  const j = row.toJSON ? row.toJSON() : row;
  const minsIn =
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
    exam_id: j.exam_id,
    exam_schedule_id: j.exam_id,
    user_id: j.user_id,
    student_id: j.student_id,
    status: j.status,
    requested_at: j.requested_at,
    admitted_at: j.admitted_at,
    admitted_by: j.admitted_by,
    denied_at: j.denied_at,
    denied_by: j.denied_by,
    left_at: j.left_at,
    minutes_in_room: minsIn,
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
          email: j.user.email,
        }
      : null,
    student: j.student ? { id: j.student.id, admission_number: j.student.admission_number } : null,
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
    in_room: entries.filter((e) => e.status === "admitted").length,
    left_after_admit: entries.filter((e) => e.status === "left").length,
    denied: entries.filter((e) => e.status === "denied").length,
    ever_admitted: entries.filter((e) => e.admitted_at).length,
  };
}

async function loadLobbyEntries(examId) {
  const rows = await ExamScheduleLobbyEntry.findAll({
    where: { exam_id: examId },
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

async function markExamLiveIfNeeded(examId) {
  const row = await Exam.findByPk(examId, { attributes: ["id", "session_status"] });
  if (row?.session_status === "scheduled") {
    await row.update({ session_status: "live" });
  }
}

const markScheduleLiveIfNeeded = markExamLiveIfNeeded;

async function broadcastLobby(examId) {
  const entries = await loadLobbyEntries(examId);
  const payload = {
    exam_id: examId,
    exam_schedule_id: examId,
    stats: buildStats(entries),
    waiting: entries.filter((e) => e.status === "waiting"),
    admitted: entries.filter((e) => e.status === "admitted"),
    left: entries.filter((e) => e.status === "left"),
    denied: entries.filter((e) => e.status === "denied"),
    all: entries,
  };
  emitToExamSchedule(examId, "exam-lobby:update", payload);
  return payload;
}

module.exports = {
  formatEntry,
  buildStats,
  loadLobbyEntries,
  markExamLiveIfNeeded,
  markScheduleLiveIfNeeded,
  broadcastLobby,
  emitToUser,
};
