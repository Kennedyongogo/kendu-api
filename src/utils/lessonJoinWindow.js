/**
 * Whether a student may join an online live class for a timetable slot.
 * Staff bypass this check at the controller layer.
 */

const { DEFAULT_SCHEDULE_TIMEZONE, lessonSlotToDate } = require("./examScheduleTime");

const EARLY_JOIN_MINUTES = 15;
/** Extra minutes after scheduled end when a live session row exists (teacher started the class). */
const LIVE_SESSION_GRACE_MINUTES = 60;

function parseOptionalDate(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{ can_join: boolean, reason: string|null, opens_at: string|null, closes_at: string|null }}
 */
function getLessonJoinWindow({
  lesson_date,
  starts_at,
  ends_at,
  session_status,
  timezone = DEFAULT_SCHEDULE_TIMEZONE,
  is_staff = false,
  early_minutes = EARLY_JOIN_MINUTES,
  live_end_time = null,
}) {
  if (is_staff) {
    return { can_join: true, reason: null, opens_at: null, closes_at: null };
  }

  if (session_status === "ended" || session_status === "cancelled") {
    return {
      can_join: false,
      reason: "This class session has ended.",
      opens_at: null,
      closes_at: null,
    };
  }

  const scheduleTimezone =
    timezone != null && String(timezone).trim() !== "" ? String(timezone).trim() : DEFAULT_SCHEDULE_TIMEZONE;
  const slotStart = lessonSlotToDate(lesson_date, starts_at, scheduleTimezone);
  const slotEnd = lessonSlotToDate(lesson_date, ends_at || starts_at, scheduleTimezone);

  if (!slotStart || !slotEnd) {
    return { can_join: true, reason: null, opens_at: null, closes_at: null };
  }

  let end = slotEnd;
  if (end.getTime() <= slotStart.getTime()) {
    end = new Date(slotStart.getTime() + 60 * 60 * 1000);
  }

  const opensAt = new Date(slotStart.getTime() - early_minutes * 60 * 1000);
  const now = new Date();

  if (now < opensAt) {
    return {
      can_join: false,
      reason: "This class is not open yet. You can join shortly before the scheduled start time.",
      opens_at: opensAt.toISOString(),
      closes_at: end.toISOString(),
    };
  }

  // Teacher has an active live session — students may join until the teacher ends it.
  if (session_status === "live") {
    return {
      can_join: true,
      reason: null,
      opens_at: opensAt.toISOString(),
      closes_at: null,
    };
  }

  let closesAt = end;
  const liveEnd = parseOptionalDate(live_end_time);
  if (liveEnd && liveEnd.getTime() > closesAt.getTime()) {
    closesAt = liveEnd;
  }
  if (session_status === "scheduled" && liveEnd) {
    closesAt = new Date(closesAt.getTime() + LIVE_SESSION_GRACE_MINUTES * 60 * 1000);
  }

  if (now > closesAt) {
    return {
      can_join: false,
      reason: "This class time has passed. The join button is no longer available.",
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

function assertStudentCanJoinLessonWindow(params) {
  const win = getLessonJoinWindow({ ...params, is_staff: false });
  if (!win.can_join) {
    const err = new Error(win.reason || "This class is not open for joining.");
    err.statusCode = 403;
    throw err;
  }
  return win;
}

module.exports = {
  EARLY_JOIN_MINUTES,
  LIVE_SESSION_GRACE_MINUTES,
  getLessonJoinWindow,
  assertStudentCanJoinLessonWindow,
};
