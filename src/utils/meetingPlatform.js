/** In-app video (LiveKit SFU or WebRTC mesh). */
function isInAppVideoPlatform(platform) {
  const p = platform == null ? "" : String(platform).trim().toLowerCase();
  return p === "webrtc" || p === "livekit";
}

function isGoogleMeetPlatform(platform) {
  const p = platform == null ? "" : String(platform).trim().toLowerCase().replace(/-/g, "_");
  return p === "google_meet" || p === "googlemeet" || p === "meet";
}

function isTeamsPlatform(platform) {
  const p = platform == null ? "" : String(platform).trim().toLowerCase().replace(/-/g, "_");
  return p === "teams" || p === "microsoft_teams";
}

function isExternalVideoPlatform(platform) {
  return !isInAppVideoPlatform(platform);
}

function defaultOnlineMeetingMode() {
  return String(process.env.ONLINE_MEETING_PLATFORM || "livekit").trim().toLowerCase();
}

module.exports = {
  isInAppVideoPlatform,
  isGoogleMeetPlatform,
  isTeamsPlatform,
  isExternalVideoPlatform,
  defaultOnlineMeetingMode,
};
