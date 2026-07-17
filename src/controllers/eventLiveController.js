const { SchoolEvent } = require("../models");
const { getLiveKitUrl, isConfigured: liveKitConfigured } = require("../services/livekitService");
const { isInAppVideoPlatform } = require("../utils/meetingPlatform");
const webrtcRoomService = require("../services/webrtcRoomService");
const {
  loadEventForLive,
  assertCanAccessEventLive,
  assertEventSupportsLive,
  isEventStaff,
} = require("../services/eventLiveAccess");
const { isOnlineDelivery, provisionLiveFields } = require("../services/eventLiveProvision");
const { endEventLiveSession } = require("../services/eventLiveEndService");
const { getEventJoinWindow } = require("../utils/eventJoinWindow");

exports.getEventLiveSession = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    const staff = isEventStaff(req);
    let access = null;
    try {
      access = await assertCanAccessEventLive(req, event);
    } catch (e) {
      if (!staff) throw e;
    }

    const joinWindow = getEventJoinWindow({
      start_date: event.start_date,
      end_date: event.end_date,
      session_status: event.session_status,
    });

    const online = isOnlineDelivery(event.delivery_mode);
    const platform = String(event.live_platform || "").toLowerCase();

    return res.json({
      success: true,
      data: {
        event: {
          id: event.id,
          title: event.title,
          slug: event.slug,
          delivery_mode: event.delivery_mode,
          start_date: event.start_date,
          end_date: event.end_date,
          session_status: event.session_status,
          live_meeting_id: event.live_meeting_id,
          live_platform: event.live_platform,
          location: event.location,
        },
        access,
        join_window: joinWindow,
        live_configured: online && !!event.live_meeting_id,
        livekit_url:
          online && platform === "livekit" && liveKitConfigured() ? getLiveKitUrl() : null,
        video_mode:
          online && platform === "livekit"
            ? "livekit"
            : online && isInAppVideoPlatform(platform)
              ? "webrtc"
              : "none",
        ice_servers:
          online && isInAppVideoPlatform(platform) && platform !== "livekit"
            ? webrtcRoomService.getIceServers()
            : [],
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.startEventLive = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can start the live event." });
    }

    const event = await loadEventForLive(req.params.id);
    assertEventSupportsLive(event);

    const joinWindow = getEventJoinWindow({
      start_date: event.start_date,
      end_date: event.end_date,
      session_status: event.session_status,
    });
    if (!joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This event is not open for hosting.",
      });
    }

    const patch = {};
    if (!event.live_meeting_id) {
      Object.assign(patch, provisionLiveFields(event.id, req.body.platform));
    }
    patch.session_status = "live";

    await event.update(patch);
    await event.reload();

    return res.json({
      success: true,
      data: event,
      message: "Live event session started.",
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.endEventLive = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can end the live event." });
    }

    const event = await loadEventForLive(req.params.id);
    assertEventSupportsLive(event);

    const result = await endEventLiveSession(event);

    return res.json({
      success: true,
      data: result.event,
      stats: {
        lobby_released: result.lobbyReleased,
        livekit_removed: result.livekitRemoved,
      },
      message: "Live event ended. Public participants were removed from the session.",
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
