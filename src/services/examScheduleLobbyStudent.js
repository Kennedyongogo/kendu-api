const { ExamScheduleLobbyEntry, User, Student } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };
const entryIncludes = [
  { model: User, as: "user", ...userSafe },
  { model: Student, as: "student", attributes: ["id", "admission_number"] },
  { model: User, as: "admitted_by_user", ...userSafe, required: false },
];

async function loadStudentLobbyEntries(examId, userId) {
  return ExamScheduleLobbyEntry.findAll({
    where: { exam_id: examId, user_id: userId },
    order: [
      ["requested_at", "DESC"],
      ["created_at", "DESC"],
    ],
    include: entryIncludes,
  });
}

function resolveStudentLobbyView(entries) {
  if (!entries?.length) return { status: "none", entry: null };

  const admitted = entries.find((e) => e.status === "admitted" && !e.left_at);
  if (admitted) return { status: "admitted", entry: admitted };

  const waiting = entries.find((e) => e.status === "waiting");
  if (waiting) return { status: "waiting", entry: waiting };

  const denied = entries.find((e) => e.status === "denied");
  if (denied) {
    const recent = denied.denied_at ? new Date(denied.denied_at).getTime() : 0;
    if (Date.now() - recent < 60000) return { status: "denied", entry: denied };
  }

  const latest = entries[0];
  return { status: latest.status, entry: latest };
}

async function ensureStudentLobbyJoin(examId, userId, studentId, options = {}) {
  const { reset = false } = options;
  const entries = await loadStudentLobbyEntries(examId, userId);
  const view = resolveStudentLobbyView(entries);

  if (!reset && view.status === "admitted") {
    return { status: "admitted", entry: view.entry, created: false };
  }
  if (!reset && view.status === "waiting") {
    return { status: "waiting", entry: view.entry, created: false };
  }

  const now = new Date();
  const row = entries[0];

  if (row) {
    await row.update({
      status: "waiting",
      requested_at: now,
      admitted_at: null,
      admitted_by: null,
      denied_at: null,
      denied_by: null,
      left_at: null,
    });
    await row.reload({ include: entryIncludes });
    return { status: "waiting", entry: row, created: false, reused: true };
  }

  const entry = await ExamScheduleLobbyEntry.create({
    exam_id: examId,
    user_id: userId,
    student_id: studentId,
    status: "waiting",
    requested_at: now,
  });
  await entry.reload({ include: entryIncludes });
  return { status: "waiting", entry, created: true, reused: false };
}

module.exports = {
  entryIncludes,
  loadStudentLobbyEntries,
  resolveStudentLobbyView,
  ensureStudentLobbyJoin,
};
