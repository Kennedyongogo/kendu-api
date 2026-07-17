const { LiveClassLobbyEntry, Student, User } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };
const entryIncludes = [
  { model: User, as: "user", ...userSafe },
  { model: Student, as: "student", attributes: ["id", "admission_number"] },
  { model: User, as: "admitted_by_user", ...userSafe, required: false },
];
const { loadLiveClassForAccess, assertCanAccessLiveClass, isTeacherRole } = require("../services/liveClassAccess");
const {
  loadLobbyEntries,
  buildStats,
  broadcastLobby,
  recordAttendanceOnAdmit,
  recordAttendanceLeave,
  formatEntry,
  emitToUser,
} = require("../services/liveClassLobbyService");
const { assertStudentCanJoinLessonWindow } = require("../utils/lessonJoinWindow");

async function getStudentForUser(userId) {
  return Student.findOne({
    where: { user_id: userId },
    attributes: ["id", "user_id", "curriculum_class_id", "curriculum_class_level_id"],
  });
}

async function assertLessonOpenForStudent(live) {
  const lesson = live?.timetable_lesson;
  assertStudentCanJoinLessonWindow({
    lesson_date: lesson?.lesson_date,
    starts_at: lesson?.starts_at,
    ends_at: lesson?.ends_at,
    timezone: lesson?.timezone,
    session_status: live?.session_status,
    live_end_time: live?.end_time,
  });
}

exports.getLiveClassLobby = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);
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

exports.getMyLobbyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    if (isTeacherRole(req)) {
      return res.json({
        success: true,
        data: { status: "admitted", role: "host", entry: null },
      });
    }

    const entry = await LiveClassLobbyEntry.findOne({
      where: { live_class_id: id, user_id: req.user.id },
      order: [["requested_at", "DESC"]],
      include: entryIncludes,
    });

    if (!entry) {
      return res.json({ success: true, data: { status: "none", entry: null } });
    }

    return res.json({
      success: true,
      data: {
        status: entry.status,
        entry: formatEntry(entry),
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.requestLobbyJoin = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    if (isTeacherRole(req)) {
      return res.json({
        success: true,
        data: { status: "admitted", role: "host" },
      });
    }

    await assertLessonOpenForStudent(live);

    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Only students use the waiting room." });
    }

    const student = await getStudentForUser(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const now = new Date();
    let entry = await LiveClassLobbyEntry.findOne({
      where: { live_class_id: id, user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });

    if (entry?.status === "admitted" && !entry.left_at) {
      return res.json({
        success: true,
        data: { status: "admitted", entry: formatEntry(entry) },
      });
    }

    if (entry?.status === "waiting") {
      return res.json({
        success: true,
        data: { status: "waiting", entry: formatEntry(entry) },
      });
    }

    if (entry?.status === "denied") {
      const recent = entry.denied_at ? new Date(entry.denied_at).getTime() : 0;
      if (Date.now() - recent < 60000) {
        return res.status(403).json({
          success: false,
          message: "The teacher declined your request. Try again in a moment or contact your teacher.",
        });
      }
    }

    entry = await LiveClassLobbyEntry.create({
      live_class_id: id,
      user_id: req.user.id,
      student_id: student.id,
      status: "waiting",
      requested_at: now,
    });

    const payload = await broadcastLobby(id);
    emitToUser(req.user.id, "live-lobby:status", {
      live_class_id: id,
      status: "waiting",
      entry: formatEntry(entry),
    });

    return res.json({
      success: true,
      data: { status: "waiting", entry: formatEntry(entry), lobby: payload.stats },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitLobbyEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit students." });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const entry = await LiveClassLobbyEntry.findOne({
      where: { id: entryId, live_class_id: id },
    });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Lobby entry not found." });
    }
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

    if (entry.student_id) {
      await recordAttendanceOnAdmit(id, entry.student_id);
    }

    await entry.reload({ include: entryIncludes });
    const formatted = formatEntry(entry);

    emitToUser(entry.user_id, "live-lobby:status", {
      live_class_id: id,
      status: "admitted",
      entry: formatted,
    });

    const payload = await broadcastLobby(id);

    return res.json({ success: true, data: { entry: formatted, lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.denyLobbyEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can deny students." });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const entry = await LiveClassLobbyEntry.findOne({
      where: { id: entryId, live_class_id: id },
    });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Lobby entry not found." });
    }
    if (entry.status !== "waiting") {
      return res.status(400).json({ success: false, message: `Cannot deny — status is ${entry.status}.` });
    }

    const now = new Date();
    await entry.update({
      status: "denied",
      denied_at: now,
      denied_by: req.user.id,
    });

    emitToUser(entry.user_id, "live-lobby:status", {
      live_class_id: id,
      status: "denied",
      entry: formatEntry(entry),
    });

    const payload = await broadcastLobby(id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitAllLobby = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit students." });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const waiting = await LiveClassLobbyEntry.findAll({
      where: { live_class_id: id, status: "waiting" },
    });

    const now = new Date();
    for (const entry of waiting) {
      await entry.update({
        status: "admitted",
        admitted_at: now,
        admitted_by: req.user.id,
        left_at: null,
      });
      if (entry.student_id) {
        await recordAttendanceOnAdmit(id, entry.student_id);
      }
      emitToUser(entry.user_id, "live-lobby:status", {
        live_class_id: id,
        status: "admitted",
        entry: formatEntry(entry),
      });
    }

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

exports.leaveLobby = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const entry = await LiveClassLobbyEntry.findOne({
      where: { live_class_id: id, user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });

    if (!entry) {
      return res.json({ success: true, data: null });
    }

    const now = new Date();
    if (entry.status === "admitted") {
      await entry.update({ status: "left", left_at: now });
      if (entry.student_id) {
        await recordAttendanceLeave(id, entry.student_id);
      }
    } else if (entry.status === "waiting") {
      await entry.update({ status: "left", left_at: now });
    }

    await broadcastLobby(id);
    return res.json({ success: true, data: formatEntry(entry) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
