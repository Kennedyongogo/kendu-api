const crypto = require("crypto");

function buildEventMeetingId(eventId) {
  const salt = `${eventId}:${Date.now()}:${crypto.randomBytes(6).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(salt).digest("hex").slice(0, 16);
  return `ev-${hash}`;
}

function isOnlineDelivery(mode) {
  const m = String(mode || "").toLowerCase();
  return m === "online" || m === "hybrid";
}

function provisionLiveFields(eventId, platform) {
  const p = String(platform || process.env.ONLINE_MEETING_PLATFORM || "livekit").trim().toLowerCase();
  return {
    live_meeting_id: buildEventMeetingId(eventId),
    live_platform: p === "livekit" ? "livekit" : p === "webrtc" ? "webrtc" : "livekit",
    session_status: "scheduled",
  };
}

module.exports = {
  buildEventMeetingId,
  isOnlineDelivery,
  provisionLiveFields,
};
