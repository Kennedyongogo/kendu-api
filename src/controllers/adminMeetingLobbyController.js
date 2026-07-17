const { AdminMeetingLobbyEntry, User } = require("../models");
const { computeDurationOnLeave } = require("../utils/eventAttendanceMinutes");
const {
  loadMeetingForLive,
  assertCanAccessAdminMeeting,
  isMeetingCreator,
  assertCreatorCanAdmit,
} = require("../services/adminMeetingLiveAccess");
const {
  loadLobbyEntries,
  formatEntry,
  broadcastLobby,
  markMeetingLiveIfNeeded,
  resolveAttendeeLobbyStatus,
  emitToUser,
} = require("../services/adminMeetingLobbyService");
const { getAdminMeetingJoinWindow } = require("../utils/adminMeetingJoinWindow");

exports.getAdminMeetingLobby = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting creator can view the waiting room." });
    }

    const entries = await loadLobbyEntries(meeting.id);
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

exports.getMyAdminMeetingLobbyStatus = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);

    if (isMeetingCreator(req, meeting)) {
      return res.json({
        success: true,
        data: { status: "admitted", role: "host", entry: null },
      });
    }

    const entry = await AdminMeetingLobbyEntry.findOne({
      where: { meeting_id: meeting.id, user_id: req.user.id },
      order: [["requested_at", "DESC"]],
    });

    if (!entry) {
      return res.json({ success: true, data: { status: "none", entry: null } });
    }

    const status = resolveAttendeeLobbyStatus(entry, meeting);
    return res.json({
      success: true,
      data: { status, entry: formatEntry(entry) },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.requestAdminMeetingLobbyJoin = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);

    if (isMeetingCreator(req, meeting)) {
      return res.json({ success: true, data: { status: "admitted", role: "host" } });
    }

    const endMs = meeting.end_time ? new Date(meeting.end_time).getTime() : NaN;
    if (!Number.isNaN(endMs) && Date.now() > endMs) {
      return res.status(403).json({
        success: false,
        message:
          "The scheduled meeting time has passed. Staff can no longer request to join.",
      });
    }

    const joinWindow = getAdminMeetingJoinWindow({
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      session_status: meeting.session_status,
      is_creator: false,
    });
    if (!joinWindow.can_join) {
      return res.status(403).json({ success: false, message: joinWindow.reason || "Cannot join now." });
    }

    const now = new Date();
    let entry = await AdminMeetingLobbyEntry.findOne({
      where: { meeting_id: meeting.id, user_id: req.user.id },
      order: [["requested_at", "DESC"]],
    });

    const effective = resolveAttendeeLobbyStatus(entry, meeting);
    if (effective === "admitted") {
      return res.json({ success: true, data: { status: "admitted", entry: formatEntry(entry) } });
    }
    if (effective === "waiting") {
      return res.json({ success: true, data: { status: "waiting", entry: formatEntry(entry) } });
    }

    entry = await AdminMeetingLobbyEntry.create({
      meeting_id: meeting.id,
      user_id: req.user.id,
      status: "waiting",
      requested_at: now,
    });

    const payload = await broadcastLobby(meeting.id);
    emitToUser(req.user.id, "admin-meeting-lobby:status", {
      meeting_id: meeting.id,
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

exports.admitAdminMeetingLobbyEntry = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);
    assertCreatorCanAdmit(req, meeting);

    const entry = await AdminMeetingLobbyEntry.findOne({
      where: { id: req.params.entryId, meeting_id: meeting.id },
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

    await markMeetingLiveIfNeeded(meeting.id);

    emitToUser(entry.user_id, "admin-meeting-lobby:status", {
      meeting_id: meeting.id,
      status: "admitted",
      entry: formatEntry(entry),
    });

    const payload = await broadcastLobby(meeting.id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.denyAdminMeetingLobbyEntry = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);
    assertCreatorCanAdmit(req, meeting);

    const entry = await AdminMeetingLobbyEntry.findOne({
      where: { id: req.params.entryId, meeting_id: meeting.id },
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

    emitToUser(entry.user_id, "admin-meeting-lobby:status", {
      meeting_id: meeting.id,
      status: "denied",
      entry: formatEntry(entry),
    });

    const payload = await broadcastLobby(meeting.id);
    return res.json({ success: true, data: { entry: formatEntry(entry), lobby: payload } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.admitAllAdminMeetingLobby = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);
    assertCreatorCanAdmit(req, meeting);

    const waiting = await AdminMeetingLobbyEntry.findAll({
      where: { meeting_id: meeting.id, status: "waiting" },
    });

    const now = new Date();
    for (const entry of waiting) {
      await entry.update({
        status: "admitted",
        admitted_at: now,
        admitted_by: req.user.id,
        left_at: null,
      });
      emitToUser(entry.user_id, "admin-meeting-lobby:status", {
        meeting_id: meeting.id,
        status: "admitted",
        entry: formatEntry(entry),
      });
    }

    if (waiting.length) {
      await markMeetingLiveIfNeeded(meeting.id);
    }

    const payload = await broadcastLobby(meeting.id);
    return res.json({
      success: true,
      data: { admitted_count: waiting.length, lobby: payload },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.leaveAdminMeetingLobby = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);

    const entry = await AdminMeetingLobbyEntry.findOne({
      where: { meeting_id: meeting.id, user_id: req.user.id },
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
    await entry.reload({ include: [{ model: User, as: "user", attributes: { exclude: ["password_hash"] } }] });

    await broadcastLobby(meeting.id);
    return res.json({ success: true, data: formatEntry(entry) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
