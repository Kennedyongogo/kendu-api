const EARLY_JOIN_MINUTES = 15;
const DEFAULT_LATE_JOIN_MINUTES = 10;

/**
 * @returns {{ can_join: boolean, reason: string|null, opens_at: string|null, closes_at: string|null }}
 */
function getExamJoinWindow({
  start_time,
  end_time,
  session_status,
  status,
  is_staff = false,
  early_minutes = EARLY_JOIN_MINUTES,
}) {
  const lifecycle = session_status != null ? session_status : status;
  if (is_staff) {
    return { can_join: true, reason: null, opens_at: null, closes_at: null };
  }

  if (lifecycle === "cancelled" || lifecycle === "completed") {
    return {
      can_join: false,
      reason: "This exam session is not open.",
      opens_at: null,
      closes_at: null,
    };
  }

  const slotStart = start_time ? new Date(start_time) : null;
  let slotEnd = end_time ? new Date(end_time) : null;
  if (!slotStart || Number.isNaN(slotStart.getTime())) {
    return { can_join: true, reason: null, opens_at: null, closes_at: null };
  }
  if (!slotEnd || Number.isNaN(slotEnd.getTime())) {
    slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  }
  const lateMin = DEFAULT_LATE_JOIN_MINUTES;
  const closesAt = new Date(slotEnd.getTime() + lateMin * 60 * 1000);
  const opensAt = new Date(slotStart.getTime() - early_minutes * 60 * 1000);
  const now = new Date();

  if (now < opensAt) {
    return {
      can_join: false,
      reason: "The invigilation room is not open yet.",
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
    };
  }
  if (now > closesAt) {
    return {
      can_join: false,
      reason: "The invigilation window for this exam has closed.",
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
    };
  }

  return {
    can_join: true,
    reason: null,
    opens_at: opensAt.toISOString(),
    closes_at: closesAt.toISOString(),
  };
}

/** @deprecated alias */
const getExamScheduleJoinWindow = (opts) => getExamJoinWindow(opts);

module.exports = { getExamJoinWindow, getExamScheduleJoinWindow, EARLY_JOIN_MINUTES, DEFAULT_LATE_JOIN_MINUTES };
