const crypto = require("crypto");
const webrtcRoomService = require("../services/webrtcRoomService");
const { isInAppVideoPlatform, defaultOnlineMeetingMode } = require("./meetingPlatform");
const { isConfigured: liveKitConfigured } = require("../services/livekitService");

function normalizePlatform(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/-/g, "_");
  if (!s) return "";
  if (s === "livekit") return "livekit";
  if (s === "webrtc") return "webrtc";
  if (s === "google_meet" || s === "googlemeet" || s === "meet") return "google_meet";
  if (s === "jitsi") return "jitsi";
  return "other";
}

function jitsiRoomName(examId) {
  return `schoolexam-${String(examId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
}

function tryProvisionExamLiveKit(row) {
  const mode = defaultOnlineMeetingMode();
  if (mode !== "livekit" && mode !== "webrtc") return null;
  if (mode === "livekit" && !liveKitConfigured()) return null;
  if (!row?.id) return null;
  const p = webrtcRoomService.provisionForExam(row.id, mode);
  const links = webrtcRoomService.urlsForExamRow(row.id);
  return {
    meeting_provider: p.platform,
    meeting_id: p.meeting_id,
    meeting_join_url: links.join_url,
    meeting_host_url: links.host_url,
    generated: true,
  };
}

function resolveExamMeetingUrls(body, row, options = {}) {
  const b = body && typeof body === "object" ? body : {};
  const joinFromBody = b.meeting_join_url != null ? String(b.meeting_join_url).trim() : "";
  const hostFromBody = b.meeting_host_url != null ? String(b.meeting_host_url).trim() : "";
  const platformFromBody = normalizePlatform(b.meeting_provider);
  const preferLiveKit = options.preferLiveKit === true;

  if (joinFromBody) {
    return {
      meeting_provider: platformFromBody || "other",
      meeting_id: b.meeting_id != null ? String(b.meeting_id).trim() : row?.meeting_id || null,
      meeting_join_url: joinFromBody,
      meeting_host_url: hostFromBody || joinFromBody,
      generated: false,
    };
  }

  if (preferLiveKit) {
    const liveKitProvision = tryProvisionExamLiveKit(row);
    if (liveKitProvision?.meeting_join_url) return liveKitProvision;
  }

  if (row?.meeting_id && isInAppVideoPlatform(row.meeting_provider)) {
    const links = webrtcRoomService.urlsForExamRow(row.id);
    return {
      meeting_provider: normalizePlatform(row.meeting_provider),
      meeting_id: String(row.meeting_id).trim(),
      meeting_join_url: links.join_url,
      meeting_host_url: links.host_url,
      generated: false,
    };
  }

  if (row?.meeting_join_url && String(row.meeting_join_url).trim() !== "" && !isInAppVideoPlatform(row.meeting_provider)) {
    return {
      meeting_provider: normalizePlatform(row.meeting_provider) || "jitsi",
      meeting_id: row.meeting_id || null,
      meeting_join_url: String(row.meeting_join_url).trim(),
      meeting_host_url:
        row.meeting_host_url && String(row.meeting_host_url).trim() !== ""
          ? String(row.meeting_host_url).trim()
          : String(row.meeting_join_url).trim(),
      generated: false,
    };
  }

  const liveKitProvision = tryProvisionExamLiveKit(row);
  if (liveKitProvision?.meeting_join_url) return liveKitProvision;

  const defaultJoin = process.env.ONLINE_MEETING_DEFAULT_JOIN_URL ? String(process.env.ONLINE_MEETING_DEFAULT_JOIN_URL).trim() : "";
  const defaultHost = process.env.ONLINE_MEETING_DEFAULT_HOST_URL ? String(process.env.ONLINE_MEETING_DEFAULT_HOST_URL).trim() : "";
  if (defaultJoin) {
    return {
      meeting_provider: platformFromBody || "other",
      meeting_id: null,
      meeting_join_url: defaultJoin,
      meeting_host_url: defaultHost || defaultJoin,
      generated: false,
    };
  }

  if (process.env.JITSI_DISABLED === "1") {
    return {
      meeting_provider: platformFromBody || "other",
      meeting_id: null,
      meeting_join_url: "",
      meeting_host_url: "",
      generated: false,
    };
  }

  const room = jitsiRoomName(row?.id);
  const join = `https://meet.jit.si/${room}`;
  const hostName =
    row?.title && String(row.title).trim() !== "" ? encodeURIComponent(String(row.title).trim().slice(0, 80)) : "exam";
  return {
    meeting_provider: "jitsi",
    meeting_id: null,
    meeting_join_url: join,
    meeting_host_url: `${join}#config.prejoinPageEnabled=false&config.enableWelcomePage=false&userInfo.displayName=${hostName}`,
    generated: true,
  };
}

module.exports = {
  normalizePlatform,
  resolveExamMeetingUrls,
  tryProvisionExamLiveKit,
};
