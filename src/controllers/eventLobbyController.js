const { EventLobbyEntry, Student, Parent, User } = require("../models");
const { computeDurationOnLeave } = require("../utils/eventAttendanceMinutes");
const {
  loadEventForLive,
  assertCanAccessEventLive,
  isEventStaff,
  isPortalAttendee,
} = require("../services/eventLiveAccess");
const {
  loadLobbyEntries,
  formatEntry,
  broadcastLobby,
  markEventLiveIfNeeded,
  emitToUser,
} = require("../services/eventLobbyService");
const { assertPortalCanJoinEventWindow } = require("../utils/eventJoinWindow");

async function getPortalProfile(user) {
  if (user.role === "student") {
    const student = await Student.findOne({
      where: { user_id: user.id },
      attributes: ["id", "user_id"],
    });
    return { student_id: student?.id || null, parent_id: null };
  }
  if (user.role === "parent") {
    const parent = await Parent.findOne({
      where: { user_id: user.id },
      attributes: ["id", "user_id"],
    });
    return { student_id: null, parent_id: parent?.id || null };
  }
  return { student_id: null, parent_id: null };
}

exports.getEventLobby = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can view the full lobby." });
    }

    const entries = await loadLobbyEntries(event.id);
    return res.json({
      success: true,
      data: {
        stats: {
          total_requests: entries.length,
          waiting: entries.filter((e) => e.status === "waiting").length,
          in_event: entries.filter((e) => e.status === "admitted").length,
          left: entries.filter((e) => e.status === "left").length,
          denied: entries.filter((e) => e.status === "denied").length,
        },
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

exports.getMyEventLobbyStatus = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    if (isEventStaff(req)) {
      return res.json({
        success: true,
        data: { status: "admitted", role: "host", entry: null },
      });
    }

    const entry = await EventLobbyEntry.findOne({
      where: { event_id: event.id, user_id: req.user.id },
      order: [["requested_at", "DESC"]],
    });

    if (!entry) {
      return res.json({ success: true, data: { status: "none", entry: null } });
    }

    return res.json({
      success: true,
      data: { status: entry.status, entry: formatEntry(entry) },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.requestEventLobbyJoin = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    if (isEventStaff(req)) {
      return res.json({ success: true, data: { status: "admitted", role: "host" } });
    }

    if (!isPortalAttendee(req)) {
      return res.status(403).json({ success: false, message: "Only students and parents use the waiting room." });
    }

    assertPortalCanJoinEventWindow({
      start_date: event.start_date,
      end_date: event.end_date,
      session_status: event.session_status,
    });

    const profile = await getPortalProfile(req.user);
    if (req.user.role === "student" && !profile.student_id) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }
    if (req.user.role === "parent" && !profile.parent_id) {
      return res.status(404).json({ success: false, message: "Parent profile not found." });
    }

    const now = new Date();
    let entry = await EventLobbyEntry.findOne({
      where: { event_id: event.id, user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });

    if (entry?.status === "admitted" && !entry.left_at) {
      return res.json({ success: true, data: { status: "admitted", entry: formatEntry(entry) } });
    }
    if (entry?.status === "waiting") {
      return res.json({ success: true, data: { status: "waiting", entry: formatEntry(entry) } });
    }
    if (entry?.status === "denied") {
      const recent = entry.denied_at ? new Date(entry.denied_at).getTime() : 0;
      if (Date.now() - recent < 60000) {
        return res.status(403).json({
          success: false,
          message: "Your request was declined. Try again in a moment.",
        });
      }
    }

    entry = await EventLobbyEntry.create({
      event_id: event.id,
      user_id: req.user.id,
      student_id: profile.student_id,
      parent_id: profile.parent_id,
      status: "waiting",
      requested_at: now,
    });

    const payload = await broadcastLobby(event.id);
    emitToUser(req.user.id, "event-lobby:status", {
      event_id: event.id,
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

exports.admitEventLobbyEntry = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit attendees." });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const entry = await EventLobbyEntry.findOne({
      where: { id: req.params.entryId, event_id: event.id },
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

    await markEventLiveIfNeeded(event.id);

    emitToUser(entry.user_id, "event-lobby:status", {
      event_id: event.id,
      status: "admitted",
      entry: formatEntry(entry),
    });

    const payload = await broadcastLobby(event.id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.denyEventLobbyEntry = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can deny attendees." });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const entry = await EventLobbyEntry.findOne({
      where: { id: req.params.entryId, event_id: event.id },
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

    emitToUser(entry.user_id, "event-lobby:status", {
      event_id: event.id,
      status: "denied",
      entry: formatEntry(entry),
    });

    const payload = await broadcastLobby(event.id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitAllEventLobby = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can admit attendees." });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const waiting = await EventLobbyEntry.findAll({
      where: { event_id: event.id, status: "waiting" },
    });

    const now = new Date();
    for (const entry of waiting) {
      await entry.update({
        status: "admitted",
        admitted_at: now,
        admitted_by: req.user.id,
        left_at: null,
      });
      emitToUser(entry.user_id, "event-lobby:status", {
        event_id: event.id,
        status: "admitted",
        entry: formatEntry(entry),
      });
    }

    if (waiting.length) {
      await markEventLiveIfNeeded(event.id);
    }

    const payload = await broadcastLobby(event.id);
    return res.json({
      success: true,
      data: { admitted_count: waiting.length, lobby: payload },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.leaveEventLobby = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const entry = await EventLobbyEntry.findOne({
      where: { event_id: event.id, user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });

    if (!entry) {
      return res.json({ success: true, data: null });
    }

    const now = new Date();
    const patch = { left_at: now };
    if (entry.status === "admitted" || entry.status === "waiting") {
      patch.status = "left";
    }
    if (entry.admitted_at) {
      patch.duration_minutes = computeDurationOnLeave(entry, now);
    }
    await entry.update(patch);
    await entry.reload({
      include: [
        { model: User, as: "user", attributes: { exclude: ["password_hash"] } },
        { model: Student, as: "student", attributes: ["id", "admission_number"] },
      ],
    });

    await broadcastLobby(event.id);
    return res.json({ success: true, data: formatEntry(entry) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
