const { getLiveKitUrl, isConfigured: liveKitConfigured } = require("../services/livekitService");
const { isInAppVideoPlatform } = require("../utils/meetingPlatform");
const webrtcRoomService = require("../services/webrtcRoomService");
const {
  loadMeetingForLive,
  assertCanAccessAdminMeeting,
  isMeetingCreator,
  isAdminPortalUser,
} = require("../services/adminMeetingLiveAccess");
const { provisionLiveFields } = require("../services/adminMeetingLiveProvision");
const {
  endAdminMeetingLiveSession,
  releaseAllLobbyEntries,
} = require("../services/adminMeetingLiveEndService");
const { emitToMeeting } = require("../services/adminMeetingRealtime");
const { broadcastLobby } = require("../services/adminMeetingLobbyService");
const { getAdminMeetingJoinWindow } = require("../utils/adminMeetingJoinWindow");

exports.getAdminMeetingLiveSession = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    const creator = isMeetingCreator(req, meeting);
    let access = null;
    try {
      access = await assertCanAccessAdminMeeting(req, meeting);
    } catch (e) {
      if (!isAdminPortalUser(req)) throw e;
    }

    const joinWindow = getAdminMeetingJoinWindow({
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      session_status: meeting.session_status,
      is_creator: creator,
    });

    const platform = String(meeting.live_platform || "").toLowerCase();

    return res.json({
      success: true,
      data: {
        meeting: {
          id: meeting.id,
          title: meeting.title,
          start_time: meeting.start_time,
          end_time: meeting.end_time,
          session_status: meeting.session_status,
          live_meeting_id: meeting.live_meeting_id,
          live_platform: meeting.live_platform,
          created_by: meeting.created_by,
        },
        access,
        is_creator: creator,
        join_window: joinWindow,
        live_configured: !!meeting.live_meeting_id,
        livekit_url:
          platform === "livekit" && liveKitConfigured() ? getLiveKitUrl() : null,
        video_mode:
          platform === "livekit"
            ? "livekit"
            : isInAppVideoPlatform(platform)
              ? "webrtc"
              : "none",
        ice_servers:
          isInAppVideoPlatform(platform) && platform !== "livekit"
            ? webrtcRoomService.getIceServers()
            : [],
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.startAdminMeetingLive = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting creator can start the session." });
    }

    const joinWindow = getAdminMeetingJoinWindow({
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      session_status: meeting.session_status,
      is_creator: true,
    });
    if (!joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This meeting is not open for hosting.",
      });
    }

    const wasEnded = String(meeting.session_status || "").toLowerCase() === "ended";
    const patch = { session_status: "live", status: "live" };
    if (!meeting.live_meeting_id) {
      Object.assign(patch, provisionLiveFields(meeting.id, req.body?.platform));
    }
    await meeting.update(patch);
    await meeting.reload();

    if (wasEnded) {
      await releaseAllLobbyEntries(meeting.id);
      try {
        await broadcastLobby(meeting.id);
      } catch (_) {
        /* non-fatal */
      }
    }

    emitToMeeting(meeting.id, "admin-meeting-live:started", {
      meeting_id: meeting.id,
      message: "The host started a new live session.",
    });

    return res.json({ success: true, data: meeting, message: "Meeting is now live." });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.endAdminMeetingLive = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting creator can end the session." });
    }

    const result = await endAdminMeetingLiveSession(meeting);

    return res.json({
      success: true,
      data: result.meeting,
      stats: { lobby_released: result.lobbyReleased, livekit_removed: result.livekitRemoved },
      message: "Meeting ended. All participants were disconnected.",
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
