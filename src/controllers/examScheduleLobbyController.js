const { ExamScheduleLobbyEntry, Student, User } = require("../models");
const {
  loadExamScheduleForAccess,
  assertCanAccessExamSchedule,
  isTeacherRole,
} = require("../services/examScheduleAccess");
const {
  formatEntry,
  broadcastLobby,
  markScheduleLiveIfNeeded,
  emitToUser,
  loadLobbyEntries,
  buildStats,
} = require("../services/examScheduleLobbyService");
const {
  resolveStudentLobbyView,
  ensureStudentLobbyJoin,
  loadStudentLobbyEntries,
} = require("../services/examScheduleLobbyStudent");
const { getExamScheduleJoinWindow } = require("../utils/examJoinWindow");

const userSafe = { attributes: { exclude: ["password_hash"] } };

/** Unified exam id — frontend still filters on exam_schedule_id in some hooks. */
function examLobbyStatusPayload(examId, status, entry) {
  return {
    exam_id: examId,
    exam_schedule_id: examId,
    status,
    entry,
  };
}

const entryIncludes = [
  { model: User, as: "user", ...userSafe },
  { model: Student, as: "student", attributes: ["id", "admission_number"] },
  { model: User, as: "admitted_by_user", ...userSafe, required: false },
];

async function getStudentForUser(userId) {
  return Student.findOne({
    where: { user_id: userId },
    attributes: ["id", "user_id", "curriculum_class_id"],
  });
}

function assertStudentExamWindow(exam) {
  const win = getExamScheduleJoinWindow({
    start_time: exam.start_time,
    end_time: exam.end_time,
    session_status: exam.session_status,
    is_staff: false,
  });
  if (!win.can_join) {
    const err = new Error(win.reason || "Exam invigilation room is not open.");
    err.statusCode = 403;
    throw err;
  }
}

exports.getExamScheduleLobby = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can view the full lobby." });
    }
    const entries = await loadLobbyEntries(id);
    return res.json({
      success: true,
      data: {
        stats: buildStats(entries),
        waiting: entries.filter((e) => e.status === "waiting"),
        admitted: entries.filter((e) => e.status === "admitted"),
        left: entries.filter((e) => e.status === "left"),
        denied: entries.filter((e) => e.status === "denied"),
        all: entries,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.getMyExamScheduleLobbyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    if (isTeacherRole(req)) {
      return res.json({
        success: true,
        data: { status: "admitted", role: "host", entry: null },
      });
    }

    const entries = await loadStudentLobbyEntries(id, req.user.id);
    const view = resolveStudentLobbyView(entries);

    return res.json({
      success: true,
      data: {
        status: view.status,
        entry: view.entry ? formatEntry(view.entry) : null,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.requestExamScheduleLobbyJoin = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    if (isTeacherRole(req)) {
      return res.json({ success: true, data: { status: "admitted", role: "host" } });
    }

    assertStudentExamWindow(schedule);

    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Only students use the waiting room." });
    }

    const student = await getStudentForUser(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const fresh = req.body?.fresh === true || req.body?.reset === true;
    const result = await ensureStudentLobbyJoin(id, req.user.id, student.id, { reset: fresh });

    const formatted = formatEntry(result.entry);
    const payload = await broadcastLobby(id);

    if (result.status === "waiting" && (result.created || result.reused)) {
      emitToUser(req.user.id, "exam-lobby:status", examLobbyStatusPayload(id, "waiting", formatted));
    }

    return res.json({
      success: true,
      data: { status: result.status, entry: formatted, lobby: payload.stats },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitExamScheduleLobbyEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit students." });
    }
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    const entry = await ExamScheduleLobbyEntry.findOne({
      where: { id: entryId, exam_id: id },
    });
    if (!entry) return res.status(404).json({ success: false, message: "Lobby entry not found." });
    if (entry.status !== "waiting") {
      return res.status(400).json({ success: false, message: `Cannot admit — status is ${entry.status}.` });
    }

    const now = new Date();
    await entry.update({
      status: "admitted",
      admitted_at: now,
      admitted_by: req.user.id,
      left_at: null,
    });
    await markScheduleLiveIfNeeded(id);
    await entry.reload({ include: entryIncludes });
    const formatted = formatEntry(entry);

    emitToUser(entry.user_id, "exam-lobby:status", examLobbyStatusPayload(id, "admitted", formatted));
    const payload = await broadcastLobby(id);
    return res.json({ success: true, data: { entry: formatted, lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.denyExamScheduleLobbyEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can deny students." });
    }
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    const entry = await ExamScheduleLobbyEntry.findOne({
      where: { id: entryId, exam_id: id },
    });
    if (!entry) return res.status(404).json({ success: false, message: "Lobby entry not found." });
    if (entry.status !== "waiting") {
      return res.status(400).json({ success: false, message: `Cannot deny — status is ${entry.status}.` });
    }

    const now = new Date();
    await entry.update({ status: "denied", denied_at: now, denied_by: req.user.id });

    emitToUser(entry.user_id, "exam-lobby:status", examLobbyStatusPayload(id, "denied", formatEntry(entry)));
    const payload = await broadcastLobby(id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitAllExamScheduleLobby = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit students." });
    }
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    const waiting = await ExamScheduleLobbyEntry.findAll({
      where: { exam_id: id, status: "waiting" },
    });
    const now = new Date();
    for (const entry of waiting) {
      await entry.update({
        status: "admitted",
        admitted_at: now,
        admitted_by: req.user.id,
        left_at: null,
      });
      await entry.reload({ include: entryIncludes });
      emitToUser(entry.user_id, "exam-lobby:status", examLobbyStatusPayload(id, "admitted", formatEntry(entry)));
    }
    if (waiting.length) await markScheduleLiveIfNeeded(id);
    const payload = await broadcastLobby(id);
    return res.json({
      success: true,
      data: { admitted_count: waiting.length, lobby: payload },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.leaveExamScheduleLobby = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    const entry = await ExamScheduleLobbyEntry.findOne({
      where: { exam_id: id,
        exam_id: id, user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });
    if (!entry) return res.json({ success: true, data: null });

    const now = new Date();
    if (entry.status === "admitted" || entry.status === "waiting") {
      await entry.update({ status: "left", left_at: now });
    }
    await broadcastLobby(id);
    return res.json({ success: true, data: formatEntry(entry) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
