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
function getEventJoinWindow({
  start_date,
  end_date,
  session_status,
  early_minutes = EARLY_JOIN_MINUTES,
}) {
  const status = String(session_status || "").toLowerCase();

  if (status === "cancelled") {
    return {
      can_join: false,
      reason: "This event was cancelled.",
      opens_at: null,
      closes_at: null,
    };
  }

  const start = start_date ? new Date(start_date) : null;
  let end = end_date ? new Date(end_date) : null;

  if (!start || Number.isNaN(start.getTime())) {
    return { can_join: true, reason: null, opens_at: null, closes_at: null };
  }

  if (!end || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  const opensAt = new Date(start.getTime() - early_minutes * 60 * 1000);
  const closesAt = end;
  const now = new Date();

  if (now < opensAt) {
    return {
      can_join: false,
      reason: "This event is not open yet. You can join 15 minutes before the start time.",
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
    };
  }

  if (now > end) {
    return {
      can_join: false,
      past_scheduled_end: true,
      reason: "This event has ended. The join option is no longer available.",
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
    };
  }

  if (status === "ended") {
    return {
      can_join: true,
      reason: null,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      resume_after_end: true,
    };
  }

  return {
    can_join: true,
    reason: null,
    opens_at: opensAt.toISOString(),
    closes_at: closesAt.toISOString(),
  };
}

function assertPortalCanJoinEventWindow(params) {
  const win = getEventJoinWindow(params);
  if (!win.can_join) {
    const err = new Error(win.reason || "This event is not open for joining.");
    err.statusCode = 403;
    throw err;
  }
  return win;
}

function canRegenerateEventPoster(event) {
  const win = getEventJoinWindow({
    start_date: event?.start_date,
    end_date: event?.end_date,
    session_status: event?.session_status,
  });
  if (win.past_scheduled_end) return false;
  const status = String(event?.session_status || "").toLowerCase();
  if (status === "cancelled") return false;
  return true;
}

module.exports = {
  EARLY_JOIN_MINUTES,
  getEventJoinWindow,
  assertPortalCanJoinEventWindow,
  canRegenerateEventPoster,
};
