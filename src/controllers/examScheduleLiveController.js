const webrtcRoomService = require("../services/webrtcRoomService");
const { getLiveKitUrl, isConfigured: liveKitConfigured, probeLiveKitServerApi } = require("../services/livekitService");
const { MODE_LABELS } = require("../utils/examProctoring");
const { isInAppVideoPlatform } = require("../utils/meetingPlatform");
const {
  loadExamForAccess,
  assertCanAccessExam,
  isStaffRole,
} = require("../services/examScheduleAccess");
const { getExamJoinWindow } = require("../utils/examJoinWindow");
const { resolveExamMeetingUrls } = require("../utils/examMeeting");
const { normalizeMode, usesLiveVideoInvigilation } = require("../utils/examProctoring");

function examNeedsLiveKitProvision(exam) {
  if (!usesLiveVideoInvigilation(exam?.proctoring_mode)) return false;
  const provider = String(exam.meeting_provider || "").toLowerCase();
  if (provider === "google_meet" || provider === "googlemeet" || provider === "meet") return true;
  const join = String(exam.meeting_join_url || "").trim();
  if (join.includes("meet.google.com")) return true;
  if (!exam.meeting_id || provider !== "livekit") return true;
  return false;
}

async function ensureLiveKitMeetingForExam(exam) {
  if (!examNeedsLiveKitProvision(exam)) return exam;
  const urls = resolveExamMeetingUrls({}, exam, { preferLiveKit: true });
  if (!urls.meeting_join_url) return exam;
  await exam.update({
    meeting_provider: urls.meeting_provider,
    meeting_id: urls.meeting_id,
    meeting_join_url: urls.meeting_join_url,
    meeting_host_url: urls.meeting_host_url,
  });
  return loadExamForAccess(exam.id);
}

exports.getExamLiveRoom = async (req, res) => {
  try {
    const { id } = req.params;
    let exam = await loadExamForAccess(id);
    await assertCanAccessExam(req, exam);
    exam = await ensureLiveKitMeetingForExam(exam);

    const staff = isStaffRole(req);
    const joinWindow = getExamJoinWindow({
      start_time: exam.start_time,
      end_time: exam.end_time,
      session_status: exam.session_status,
      is_staff: staff,
    });

    if (req.user.role === "student" && !joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This exam room is not open.",
        data: { can_join: false, join_blocked_reason: joinWindow.reason },
      });
    }

    const platform = String(exam.meeting_provider || "").toLowerCase();
    const role = staff ? "teacher" : "student";
    const proctoringMode = normalizeMode(exam.proctoring_mode) || "record_only";
    const liveInvigilation = usesLiveVideoInvigilation(proctoringMode);
    const serverProbe = liveKitConfigured() ? await probeLiveKitServerApi() : { ok: false, reason: "not configured" };

    return res.json({
      success: true,
      data: {
        exam_id: exam.id,
        exam_schedule_id: exam.id,
        exam_title: exam.title || "Exam",
        meeting_id: exam.meeting_id,
        platform,
        session_status: exam.session_status,
        status: exam.session_status,
        proctoring_mode: proctoringMode,
        proctoring_mode_label: MODE_LABELS[proctoringMode] || proctoringMode,
        uses_live_invigilation: liveInvigilation,
        can_join: joinWindow.can_join,
        join_blocked_reason: joinWindow.reason,
        join_opens_at: joinWindow.opens_at,
        join_closes_at: joinWindow.closes_at,
        ice_servers:
          isInAppVideoPlatform(platform) && platform !== "livekit" ? webrtcRoomService.getIceServers() : [],
        livekit_url: platform === "livekit" && liveKitConfigured() ? getLiveKitUrl() : null,
        video_mode:
          platform === "livekit"
            ? "livekit"
            : isInAppVideoPlatform(platform)
              ? "webrtc"
              : "external",
        media_mode: staff ? "video" : exam.requires_webcam === false ? "optional" : "video",
        role,
        join_path: webrtcRoomService.portalExamInvigilationPath(exam.id),
        host_path: webrtcRoomService.adminExamLivePath(exam.id),
        livekit_diagnostics: {
          server_configured: liveKitConfigured(),
          server_api_reachable: serverProbe.ok === true,
          server_api_detail: serverProbe.ok ? "ok" : serverProbe.reason || "unreachable",
          meeting_ready: platform === "livekit" && !!exam.meeting_id,
          video_needs_browser_websocket: platform === "livekit",
          note: liveInvigilation
            ? "Lobby/admit uses your API. Camera/audio uses browser → LiveKit Cloud (not the same as lobby)."
            : "This exam is not Live invigilation — open the Proctor monitor tab or set proctoring_mode to live_monitor.",
        },
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

/** @deprecated alias */
exports.getExamScheduleLiveRoom = exports.getExamLiveRoom;
