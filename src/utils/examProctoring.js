/** Three exam proctoring modes — webcam and tab rules are fixed per mode. */

const PROCTORING_MODES = ["record_only", "live_monitor", "strict_auto"];

const MODE_DEFAULTS = {
  live_monitor: {
    requires_webcam: true,
    prevent_tab_switch: true,
    exam_access_policy: "paper_plus_room_required",
  },
  strict_auto: {
    requires_webcam: false,
    prevent_tab_switch: true,
    exam_access_policy: "paper_only",
  },
  record_only: {
    requires_webcam: false,
    prevent_tab_switch: false,
    exam_access_policy: "paper_only",
  },
};

const MODE_LABELS = {
  live_monitor: "Live invigilation",
  strict_auto: "Strict online exam",
  record_only: "Monitored online exam",
};

/** Activity panel (tab switches, session logs) — not live video. */
const ACTIVITY_MONITOR_MODES = ["record_only", "strict_auto"];

function usesActivityMonitor(mode) {
  const m = normalizeMode(mode);
  return m ? ACTIVITY_MONITOR_MODES.includes(m) : false;
}

/** Live invigilation with camera — uses Google Meet (not LiveKit). */
function usesLiveVideoInvigilation(mode) {
  return normalizeMode(mode) === "live_monitor";
}

/** @deprecated use usesLiveVideoInvigilation */
function usesLiveKitInvigilation(mode) {
  return usesLiveVideoInvigilation(mode);
}

function normalizeMode(raw) {
  const m = String(raw || "").trim();
  if (m === "none" || !m) return "record_only";
  if (PROCTORING_MODES.includes(m)) return m;
  return null;
}

function examAccessPolicyForMode(mode) {
  return MODE_DEFAULTS[mode]?.exam_access_policy || "paper_only";
}

/** Student must use invigilation lobby/room before opening the paper. */
function scheduleRequiresInvigilationRoom(exam) {
  if (!exam) return false;
  const mode = normalizeMode(exam.proctoring_mode) || "record_only";
  if (mode === "live_monitor") return true;
  const provider = String(exam.meeting_provider || "").toLowerCase();
  if (exam.video_mode === "livekit" || provider === "livekit") return true;
  if (isGoogleMeetInvigilationProvider(provider) || exam.video_mode === "google_meet") return true;
  if (exam.meeting_id || exam.meeting_join_url) return true;
  const rules = exam.proctoring_rules_json;
  if (rules && typeof rules === "object" && rules.exam_access_policy === "paper_plus_room_required") {
    return true;
  }
  return false;
}

/**
 * Apply proctoring_mode and derived webcam/tab/access fields to a create/update payload.
 * Explicit requires_webcam / prevent_tab_switch in body are ignored when proctoring_mode is set.
 */
function applyProctoringToPayload(body, payload) {
  const src = body && typeof body === "object" ? body : {};
  const mode = normalizeMode(src.proctoring_mode);
  if (!mode) {
    if (src.proctoring_mode !== undefined) {
      throw new Error(`proctoring_mode must be one of: ${PROCTORING_MODES.join(", ")}`);
    }
    return;
  }
  const defs = MODE_DEFAULTS[mode];
  payload.proctoring_mode = mode;
  payload.requires_webcam = defs.requires_webcam;
  payload.prevent_tab_switch = defs.prevent_tab_switch;
  const prev =
    payload.proctoring_rules_json && typeof payload.proctoring_rules_json === "object"
      ? payload.proctoring_rules_json
      : src.proctoring_rules_json && typeof src.proctoring_rules_json === "object"
        ? src.proctoring_rules_json
        : {};
  payload.proctoring_rules_json = {
    ...prev,
    exam_access_policy: defs.exam_access_policy,
  };
}

function isGoogleMeetInvigilationProvider(provider) {
  const p = String(provider || "").trim().toLowerCase().replace(/-/g, "_");
  return p === "google_meet" || p === "googlemeet" || p === "meet";
}

/** HR / attendance: teacher present when session is live/completed or invigilator checked in. */
function isTeacherAttendedForHr(exam) {
  if (!exam) return false;
  const status = String(exam.session_status || "").toLowerCase();
  if (status === "live" || status === "completed") return true;
  const rules = exam.proctoring_rules_json;
  return !!(rules && typeof rules === "object" && rules.invigilator_present_at);
}

function teacherAttendedAtForExam(exam) {
  const rules = exam?.proctoring_rules_json;
  if (rules && typeof rules === "object" && rules.invigilator_present_at) {
    return rules.invigilator_present_at;
  }
  const status = String(exam?.session_status || "").toLowerCase();
  if (status === "live" || status === "completed") {
    return exam.updated_at || null;
  }
  return null;
}

/**
 * Non-video exams (record_only, strict_auto) never use the video lobby, so session_status
 * stays scheduled until a teacher opens supervision. Mark live on first staff check-in.
 */
async function markActivityExamInvigilatorPresent(exam, { userId = null, source = "activity_supervision" } = {}) {
  if (!exam?.id) return { marked: false };
  const mode = normalizeMode(exam.proctoring_mode);
  if (!usesActivityMonitor(mode)) return { marked: false };
  const status = String(exam.session_status || "").toLowerCase();
  if (status === "cancelled" || status === "completed") return { marked: false };
  if (status === "live") return { marked: false, already: true };

  const prev =
    exam.proctoring_rules_json && typeof exam.proctoring_rules_json === "object"
      ? exam.proctoring_rules_json
      : {};
  const now = new Date();
  const presentAt = prev.invigilator_present_at || now.toISOString();
  await exam.update({
    session_status: "live",
    updated_by: userId,
    proctoring_rules_json: {
      ...prev,
      invigilator_present_at: presentAt,
      invigilator_present_by_user_id: prev.invigilator_present_by_user_id || userId,
      invigilator_present_source: prev.invigilator_present_source || source,
    },
  });
  return { marked: true };
}

module.exports = {
  PROCTORING_MODES,
  ACTIVITY_MONITOR_MODES,
  MODE_DEFAULTS,
  MODE_LABELS,
  normalizeMode,
  examAccessPolicyForMode,
  scheduleRequiresInvigilationRoom,
  applyProctoringToPayload,
  usesActivityMonitor,
  usesLiveVideoInvigilation,
  usesLiveKitInvigilation,
  isGoogleMeetInvigilationProvider,
  isTeacherAttendedForHr,
  teacherAttendedAtForExam,
  markActivityExamInvigilatorPresent,
};
