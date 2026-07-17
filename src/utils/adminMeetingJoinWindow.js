const EARLY_JOIN_MINUTES = 15;

/**
 * @returns {{
 *   can_join: boolean,
 *   reason: string|null,
 *   opens_at: string|null,
 *   closes_at: string|null,
 *   past_scheduled_end?: boolean,
 *   resume_after_end?: boolean,
 * }}
 */
function getAdminMeetingJoinWindow({
  start_time,
  end_time,
  session_status,
  is_creator = false,
  early_minutes = EARLY_JOIN_MINUTES,
}) {
  const status = String(session_status || "").toLowerCase();

  if (status === "cancelled") {
    return {
      can_join: false,
      reason: "This meeting was cancelled.",
      opens_at: null,
      closes_at: null,
    };
  }

  const now = Date.now();
  const startMs = start_time ? new Date(start_time).getTime() : NaN;
  const endMs = end_time ? new Date(end_time).getTime() : NaN;
  const earlyMs = early_minutes * 60 * 1000;
  const opensAt =
    !Number.isNaN(startMs) ? new Date(startMs - earlyMs).toISOString() : null;
  const closesAt = !Number.isNaN(endMs) ? new Date(endMs).toISOString() : null;

  if (!Number.isNaN(startMs) && now < startMs - earlyMs) {
    return {
      can_join: false,
      reason: "This meeting is not open yet. You can join 15 minutes before the start time.",
      opens_at: opensAt,
      closes_at: closesAt,
    };
  }

  if (!Number.isNaN(endMs) && now > endMs) {
    return {
      can_join: false,
      past_scheduled_end: true,
      reason:
        "This meeting’s scheduled time has passed. Extend the end time in Edit to continue, or use End live if the session is still open.",
      opens_at: opensAt,
      closes_at: closesAt,
    };
  }

  if (status === "ended") {
    return {
      can_join: true,
      reason: null,
      opens_at: opensAt,
      closes_at: closesAt,
      resume_after_end: true,
    };
  }

  return {
    can_join: true,
    reason: null,
    opens_at: opensAt,
    closes_at: closesAt,
  };
}

function assertAdminMeetingJoinWindow(params) {
  const win = getAdminMeetingJoinWindow(params);
  if (!win.can_join) {
    const err = new Error(win.reason || "This meeting is not open for joining.");
    err.statusCode = 403;
    throw err;
  }
  return win;
}

function canNotifyAdminMeetingStaff(meeting) {
  const win = getAdminMeetingJoinWindow({
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    session_status: meeting.session_status,
    is_creator: true,
  });
  if (win.past_scheduled_end) return false;
  const status = String(meeting.session_status || "").toLowerCase();
  if (status === "cancelled") return false;
  return win.can_join === true;
}

module.exports = {
  EARLY_JOIN_MINUTES,
  getAdminMeetingJoinWindow,
  assertAdminMeetingJoinWindow,
  canNotifyAdminMeetingStaff,
};
