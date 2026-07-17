const { AccessToken, RoomServiceClient } = require("livekit-server-sdk");
const { PUBLIC_PORTAL_ALLOWED_ROLES } = require("../constants/userRoles");

function getLiveKitUrl() {
  return (
    process.env.LIVEKIT_URL ||
    process.env.LIVEKIT_WS_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

function isConfigured() {
  return !!(getLiveKitUrl() && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

/**
 * LiveKit roles:
 * - host / teacher: room admin (remote moderation) + publish + subscribe
 * - participant / student: publish + subscribe only (no roomAdmin)
 * @param {{ roomName: string, identity: string, name?: string, role?: 'host'|'teacher'|'participant'|'student' }}
 */
async function createParticipantToken({ roomName, identity, name, role = "participant" }) {
  if (!isConfigured()) {
    const err = new Error("LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.");
    err.statusCode = 503;
    throw err;
  }
  if (!roomName) {
    const err = new Error("roomName is required");
    err.statusCode = 400;
    throw err;
  }

  const normalizedRole = String(role || "participant").toLowerCase();
  const isRoomAdmin = normalizedRole === "host" || normalizedRole === "teacher";
  const classroomRole = isRoomAdmin ? "teacher" : "student";
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: String(identity),
    name: name ? String(name) : String(identity),
    ttl: 4 * 60 * 60,
    metadata: JSON.stringify({ classroomRole }),
  });

  at.addGrant({
    roomJoin: true,
    room: String(roomName),
    canSubscribe: true,
    canPublish: true,
    canPublishData: isRoomAdmin,
    ...(isRoomAdmin ? { roomAdmin: true, canUpdateOwnMetadata: true } : {}),
  });

  const token = await at.toJwt();
  return { token, url: getLiveKitUrl() };
}

/** HTTP base URL for RoomServiceClient (not WebSocket). */
function getLiveKitApiUrl() {
  let url = getLiveKitUrl();
  if (!url) return "";
  if (url.startsWith("wss://")) return url.replace("wss://", "https://");
  if (url.startsWith("ws://")) return url.replace("ws://", "http://");
  if (!url.startsWith("http")) return `https://${url}`;
  return url;
}

function getRoomServiceClient() {
  const host = getLiveKitApiUrl();
  if (!host || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return null;
  }
  return new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

/**
 * Disconnect parents/students from a LiveKit room (staff remain connected).
 * @returns {Promise<{ removed: number }>}
 */
async function removePublicParticipantsFromRoom(roomName) {
  if (!isConfigured() || !roomName) return { removed: 0 };

  const client = getRoomServiceClient();
  if (!client) return { removed: 0 };

  const { User } = require("../models");
  let participants = [];
  try {
    participants = await client.listParticipants(String(roomName));
  } catch (err) {
    if (/not found|404|does not exist/i.test(String(err?.message || err))) {
      return { removed: 0 };
    }
    throw err;
  }

  let removed = 0;
  for (const participant of participants) {
    const identity = participant?.identity;
    if (!identity) continue;
    const user = await User.findByPk(identity, { attributes: ["id", "role"] });
    if (!user || !PUBLIC_PORTAL_ALLOWED_ROLES.includes(user.role)) continue;
    try {
      await client.removeParticipant(String(roomName), String(identity));
      removed += 1;
    } catch (_) {
      /* participant may have already left */
    }
  }
  return { removed };
}

/** Disconnect every participant from a LiveKit room. */
async function removeAllParticipantsFromRoom(roomName) {
  if (!isConfigured() || !roomName) return { removed: 0 };

  const client = getRoomServiceClient();
  if (!client) return { removed: 0 };

  let participants = [];
  try {
    participants = await client.listParticipants(String(roomName));
  } catch (err) {
    if (/not found|404|does not exist/i.test(String(err?.message || err))) {
      return { removed: 0 };
    }
    throw err;
  }

  let removed = 0;
  for (const participant of participants) {
    const identity = participant?.identity;
    if (!identity) continue;
    try {
      await client.removeParticipant(String(roomName), String(identity));
      removed += 1;
    } catch (_) {
      /* already left */
    }
  }
  return { removed };
}

/**
 * Verify LIVEKIT_API_KEY/SECRET against LiveKit Cloud (HTTP Room API).
 * Browser WebSocket can still fail if the network blocks wss while this passes.
 */
async function probeLiveKitServerApi() {
  if (!isConfigured()) {
    return { ok: false, reason: "LiveKit env vars missing" };
  }
  const client = getRoomServiceClient();
  if (!client) {
    return { ok: false, reason: "RoomServiceClient not available", apiHost: getLiveKitApiUrl() };
  }
  try {
    const rooms = await client.listRooms();
    return {
      ok: true,
      apiHost: getLiveKitApiUrl(),
      roomCount: Array.isArray(rooms) ? rooms.length : 0,
    };
  } catch (err) {
    return {
      ok: false,
      apiHost: getLiveKitApiUrl(),
      reason: err?.message || String(err),
    };
  }
}

module.exports = {
  getLiveKitUrl,
  getLiveKitApiUrl,
  isConfigured,
  createParticipantToken,
  probeLiveKitServerApi,
  removePublicParticipantsFromRoom,
  removeAllParticipantsFromRoom,
};
