const { AdminMeetingLobbyEntry, User } = require("../models");
const { createParticipantToken, isConfigured } = require("../services/livekitService");
const {
  loadMeetingForLive,
  assertCanAccessAdminMeeting,
  isMeetingCreator,
} = require("../services/adminMeetingLiveAccess");
const { getAdminMeetingJoinWindow } = require("../utils/adminMeetingJoinWindow");

exports.issueAdminMeetingLiveKitToken = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "LiveKit is not configured on the server.",
      });
    }

    const meeting = await loadMeetingForLive(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    await assertCanAccessAdminMeeting(req, meeting);

    const platform = String(meeting.live_platform || "").toLowerCase();
    if (platform !== "livekit") {
      return res.status(400).json({
        success: false,
        message: "This meeting does not use LiveKit video.",
      });
    }

    const roomName = String(meeting.live_meeting_id || "").trim();
    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "No video room yet. Ask the host to start the meeting.",
      });
    }

    const creator = isMeetingCreator(req, meeting);
    const joinWindow = getAdminMeetingJoinWindow({
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      session_status: meeting.session_status,
      is_creator: creator,
    });

    if (!joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This meeting is not open for joining.",
      });
    }

    if (!creator) {
      const session = String(meeting.session_status || "").toLowerCase();
      if (session === "ended" || session === "cancelled") {
        return res.status(403).json({
          success: false,
          message: "This meeting has ended. Wait for the host to start a new live session.",
        });
      }
      const entry = await AdminMeetingLobbyEntry.findOne({
        where: {
          meeting_id: meeting.id,
          user_id: req.user.id,
          status: "admitted",
          left_at: null,
        },
        order: [["admitted_at", "DESC"]],
        attributes: ["id", "status", "left_at"],
      });
      if (!entry) {
        return res.status(403).json({
          success: false,
          message: "You must be admitted by the host before joining video.",
        });
      }
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "full_name", "username"],
    });
    const displayName =
      (user?.full_name && String(user.full_name).trim()) ||
      (user?.username && String(user.username).trim()) ||
      "Staff";

    const livekitRole = creator ? "host" : "participant";
    const participantIdentity = String(req.user.id);

    const { token, url } = await createParticipantToken({
      roomName,
      identity: participantIdentity,
      name: displayName,
      role: livekitRole,
    });

    return res.json({
      success: true,
      data: {
        token,
        url,
        room_name: roomName,
        meeting_id: meeting.id,
        identity: participantIdentity,
        livekit_role: livekitRole,
        is_host: creator,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
