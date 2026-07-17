const { Op } = require("sequelize");
const { AdminMeetingLobbyEntry, AdminMeetingLiveHandRaise } = require("../models");
const { isConfigured, removeAllParticipantsFromRoom } = require("./livekitService");
const { emitToMeeting } = require("./adminMeetingRealtime");
const { broadcastLobby } = require("./adminMeetingLobbyService");
const { computeDurationOnLeave } = require("../utils/eventAttendanceMinutes");

async function releaseAllLobbyEntries(meetingId, leftAt = new Date()) {
  const entries = await AdminMeetingLobbyEntry.findAll({
    where: {
      meeting_id: meetingId,
      status: { [Op.in]: ["waiting", "admitted"] },
    },
  });

  let released = 0;
  for (const entry of entries) {
    const patch = { left_at: leftAt, status: "left" };
    if (entry.admitted_at) {
      patch.duration_minutes = computeDurationOnLeave(entry, leftAt);
    }
    await entry.update(patch);
    released += 1;
  }
  return released;
}

async function endAdminMeetingLiveSession(meeting) {
  const now = new Date();
  await meeting.update({ session_status: "ended", status: "ended" });

  const lobbyReleased = await releaseAllLobbyEntries(meeting.id, now);

  await AdminMeetingLiveHandRaise.update(
    { status: "lowered", lowered_at: now },
    { where: { meeting_id: meeting.id, status: "raised" } }
  );

  const roomName = String(meeting.live_meeting_id || "").trim();
  const platform = String(meeting.live_platform || "").toLowerCase();
  let livekitRemoved = 0;
  if (platform === "livekit" && roomName) {
    const result = await removeAllParticipantsFromRoom(roomName);
    livekitRemoved = result.removed;
  }

  emitToMeeting(meeting.id, "admin-meeting-live:ended", {
    meeting_id: meeting.id,
    message: "This meeting has ended.",
  });
  emitToMeeting(meeting.id, "admin-meeting-hand:update", {
    raised_hands: [],
    meeting_id: meeting.id,
  });

  try {
    await broadcastLobby(meeting.id);
  } catch (_) {
    /* non-fatal */
  }

  return { meeting, lobbyReleased, livekitRemoved };
}

module.exports = { endAdminMeetingLiveSession, releaseAllLobbyEntries };
