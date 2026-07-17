const { ExamScheduleLobbyEntry, User } = require("../models");
const { createParticipantToken, isConfigured } = require("../services/livekitService");
const { isInAppVideoPlatform } = require("../utils/meetingPlatform");
const {
  loadExamScheduleForAccess,
  assertCanAccessExamSchedule,
  isTeacherRole,
  isStaffRole,
} = require("../services/examScheduleAccess");
const { getExamScheduleJoinWindow } = require("../utils/examJoinWindow");
const { resolveExamMeetingUrls } = require("../utils/examMeeting");
const { usesLiveVideoInvigilation } = require("../utils/examProctoring");

exports.issueExamScheduleLiveKitToken = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "LiveKit is not configured on the server.",
      });
    }

    const { id } = req.params;
    let schedule = await loadExamScheduleForAccess(id);
    await assertCanAccessExamSchedule(req, schedule);

    if (!usesLiveVideoInvigilation(schedule.proctoring_mode)) {
      return res.status(400).json({
        success: false,
        message: "This exam does not use live video invigilation.",
      });
    }

    const provider = String(schedule.meeting_provider || "").toLowerCase();
    const join = String(schedule.meeting_join_url || "").trim();
    const needsLiveKit =
      provider !== "livekit" ||
      !schedule.meeting_id ||
      join.includes("meet.google.com") ||
      provider === "google_meet" ||
      provider === "googlemeet";

    if (needsLiveKit) {
      const urls = resolveExamMeetingUrls({}, schedule, { preferLiveKit: true });
      if (urls.meeting_join_url) {
        await schedule.update({
          meeting_provider: urls.meeting_provider,
          meeting_id: urls.meeting_id,
          meeting_join_url: urls.meeting_join_url,
          meeting_host_url: urls.meeting_host_url,
        });
        schedule = await loadExamScheduleForAccess(id);
      }
    }

    const platform = String(schedule.meeting_provider || "").toLowerCase();
    if (platform !== "livekit") {
      return res.status(400).json({
        success: false,
        message: "This exam session does not use LiveKit video.",
      });
    }

    const roomName = String(schedule.meeting_id || "").trim();
    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "LiveKit is not available for this exam. Ask your teacher to check server LiveKit settings.",
      });
    }

    const staff = isStaffRole(req);
    const joinWindow = getExamScheduleJoinWindow({
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      session_status: schedule.session_status,
      is_staff: staff,
    });

    if (!staff && !joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This exam room is not open for joining.",
      });
    }

    let role = isTeacherRole(req) ? "teacher" : "student";

    if (!staff) {
      const entry = await ExamScheduleLobbyEntry.findOne({
        where: { exam_id: schedule.id, user_id: req.user.id },
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

    const { token, url } = await createParticipantToken({
      roomName,
      identity: String(req.user.id),
      name: displayName,
      role,
    });

    return res.json({
      success: true,
      data: {
        token,
        url,
        room_name: roomName,
        exam_id: schedule.id,
        exam_schedule_id: schedule.id,
        identity: String(req.user.id),
        livekit_role: role,
        video_mode: isInAppVideoPlatform(platform) && platform === "livekit" ? "livekit" : "external",
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
