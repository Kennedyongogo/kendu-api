const crypto = require("crypto");

function buildAdminMeetingRoomId(meetingId) {
  const salt = `${meetingId}:${Date.now()}:${crypto.randomBytes(6).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(salt).digest("hex").slice(0, 16);
  return `am-${hash}`;
}

function provisionLiveFields(meetingId, platform) {
  const p = String(platform || process.env.ONLINE_MEETING_PLATFORM || "livekit").trim().toLowerCase();
  return {
    live_meeting_id: buildAdminMeetingRoomId(meetingId),
    live_platform: p === "livekit" ? "livekit" : p === "webrtc" ? "webrtc" : "livekit",
    session_status: "scheduled",
  };
}

module.exports = { buildAdminMeetingRoomId, provisionLiveFields };
