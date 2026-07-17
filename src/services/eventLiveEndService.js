const { Op } = require("sequelize");
const { EventLobbyEntry, EventLiveHandRaise, User } = require("../models");
const { PUBLIC_PORTAL_ALLOWED_ROLES } = require("../constants/userRoles");
const { isOnlineDelivery } = require("./eventLiveProvision");
const { isConfigured, removePublicParticipantsFromRoom } = require("./livekitService");
const { emitToEvent, emitToUser } = require("./eventRealtime");
const { broadcastLobby } = require("./eventLobbyService");
const { computeDurationOnLeave } = require("../utils/eventAttendanceMinutes");

async function releasePublicLobbyEntries(eventId, leftAt = new Date()) {
  const entries = await EventLobbyEntry.findAll({
    where: {
      event_id: eventId,
      status: { [Op.in]: ["waiting", "admitted"] },
    },
    include: [{ model: User, as: "user", attributes: ["id", "role"] }],
  });

  let released = 0;
  for (const entry of entries) {
    const role = entry.user?.role;
    if (!PUBLIC_PORTAL_ALLOWED_ROLES.includes(role)) continue;

    const patch = { left_at: leftAt, status: "left" };
    if (entry.admitted_at) {
      patch.duration_minutes = computeDurationOnLeave(entry, leftAt);
    }
    await entry.update(patch);
    emitToUser(entry.user_id, "event-lobby:status", {
      event_id: eventId,
      status: "left",
      reason: "ended",
    });
    released += 1;
  }
  return released;
}

/**
 * End live session: mark ended, eject portal users from video, clear lobby, notify clients.
 */
async function endEventLiveSession(event) {
  const now = new Date();
  await event.update({ session_status: "ended" });

  const lobbyReleased = await releasePublicLobbyEntries(event.id, now);

  await EventLiveHandRaise.update(
    { status: "lowered", lowered_at: now },
    { where: { event_id: event.id, status: "raised" } }
  );

  let livekitRemoved = 0;
  const roomName = String(event.live_meeting_id || "").trim();
  const platform = String(event.live_platform || "").toLowerCase();
  if (isOnlineDelivery(event.delivery_mode) && platform === "livekit" && roomName && isConfigured()) {
    const result = await removePublicParticipantsFromRoom(roomName);
    livekitRemoved = result.removed;
  }

  const payload = {
    event_id: event.id,
    message: "This event has ended.",
  };
  emitToEvent(event.id, "event-live:ended", payload);
  emitToEvent(event.id, "event-hand:update", { raised_hands: [], event_id: event.id });

  try {
    await broadcastLobby(event.id);
  } catch (_) {
    /* non-fatal */
  }

  return {
    event,
    lobbyReleased,
    livekitRemoved,
  };
}

module.exports = { endEventLiveSession, releasePublicLobbyEntries };
