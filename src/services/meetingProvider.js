/**
 * Free Jitsi Meet rooms — no API keys or billing (public meet.jit.si or self-hosted JITSI_DOMAIN).
 *
 * Env (optional):
 *   JITSI_DOMAIN=meet.jit.si
 *   JITSI_APP_NAME=SchoolLiveClass
 *   DEFAULT_MEETING_DURATION=60   (minutes — informational / status helper only)
 *
 * Disable auto-Jitsi (fall back to ONLINE_MEETING_DEFAULT_* URLs or request body only):
 *   JITSI_DISABLED=1
 */

const crypto = require("crypto");

const JITSI_DOMAIN = (process.env.JITSI_DOMAIN || "meet.jit.si").trim().replace(/^https?:\/\//i, "");
const JITSI_APP_NAME = process.env.JITSI_APP_NAME || "SchoolLiveClass";
const DEFAULT_MEETING_DURATION = Math.min(480, Math.max(15, parseInt(process.env.DEFAULT_MEETING_DURATION, 10) || 60));

function sanitizeSlugPart(raw, maxLen) {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, maxLen);
  return s || "x";
}

/**
 * Short unique room name (fits live_classes.meeting_id VARCHAR(120)).
 */
function buildRoomName(lessonId, classId, teacherId) {
  const salt = `${lessonId}:${classId}:${teacherId}:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(salt).digest("hex").slice(0, 14);
  const prefix = sanitizeSlugPart(JITSI_APP_NAME, 24);
  const name = `${prefix}-${hash}`;
  return name.slice(0, 100);
}

/**
 * @param {Object} params
 * @param {string} params.lessonId
 * @param {string} params.classId
 * @param {string} [params.teacherId]
 * @param {string} [params.title]
 * @returns {Promise<{ meeting_id: string, join_url: string, host_url: string, platform: string, duration_minutes: number }>}
 */
async function createMeeting({ lessonId, classId, teacherId, title }) {
  const meeting_id = buildRoomName(lessonId, classId || "class", teacherId || "staff");
  const join_url = `https://${JITSI_DOMAIN}/${meeting_id}`;
  const displayHint = title ? String(title).slice(0, 48).replace(/[^\w\s-]/g, "") : "Teacher";
  const host_url = `${join_url}#config.prejoinPageEnabled=false&config.enableWelcomePage=false&userInfo.displayName=${encodeURIComponent(displayHint)}`;

  return {
    meeting_id,
    join_url,
    host_url,
    platform: "jitsi",
    duration_minutes: DEFAULT_MEETING_DURATION,
  };
}

async function getMeetingStatus(meetingId, createdAt) {
  void meetingId;
  if (!createdAt) return "scheduled";
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return "scheduled";
  const minutesSince = (Date.now() - createdMs) / (1000 * 60);
  if (minutesSince > DEFAULT_MEETING_DURATION + 45) return "ended";
  return "live";
}

async function endMeeting(meetingId) {
  void meetingId;
  return { success: true, message: "Jitsi rooms close when empty; nothing to revoke via API." };
}

module.exports = {
  createMeeting,
  getMeetingStatus,
  endMeeting,
  JITSI_DOMAIN,
  DEFAULT_MEETING_DURATION,
};
