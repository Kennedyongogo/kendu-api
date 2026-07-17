const { EventLobbyEntry, User } = require("../models");
const { createParticipantToken, isConfigured } = require("../services/livekitService");
const {
  loadEventForLive,
  assertCanAccessEventLive,
  isEventStaff,
} = require("../services/eventLiveAccess");
const { getEventJoinWindow } = require("../utils/eventJoinWindow");

exports.issueEventLiveKitToken = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "LiveKit is not configured on the server.",
      });
    }

    const event = await loadEventForLive(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    await assertCanAccessEventLive(req, event);

    const platform = String(event.live_platform || "").toLowerCase();
    if (platform !== "livekit") {
      return res.status(400).json({
        success: false,
        message: "This event does not use LiveKit video.",
      });
    }

    const roomName = String(event.live_meeting_id || "").trim();
    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "This event has no video room configured. Ask staff to start the live session.",
      });
    }

    const staff = isEventStaff(req);
    const joinWindow = getEventJoinWindow({
      start_date: event.start_date,
      end_date: event.end_date,
      session_status: event.session_status,
    });

    if (!joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This event is not open for joining.",
      });
    }

    const isEventHost =
      staff && event.created_by && String(event.created_by) === String(req.user.id);
    let role = staff ? (isEventHost ? "host" : "participant") : "participant";

    if (!staff) {
      const entry = await EventLobbyEntry.findOne({
        where: { event_id: event.id, user_id: req.user.id },
        order: [["requested_at", "DESC"]],
        attributes: ["status"],
      });
      if (!entry || entry.status !== "admitted") {
        return res.status(403).json({
          success: false,
          message: "You must be admitted from the waiting room before joining video.",
        });
      }
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "full_name", "username"],
    });
    const displayName =
      (user?.full_name && String(user.full_name).trim()) ||
      (user?.username && String(user.username).trim()) ||
      "Participant";

    const participantIdentity = String(req.user.id);

    const { token, url } = await createParticipantToken({
      roomName,
      identity: participantIdentity,
      name: displayName,
      role,
    });

    return res.json({
      success: true,
      data: {
        token,
        url,
        room_name: roomName,
        event_id: event.id,
        identity: participantIdentity,
        livekit_role: role,
        is_host: role === "host",
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
