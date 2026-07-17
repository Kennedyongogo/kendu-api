const { ExamAttempt, ExamSessionLog } = require("../models");
const {
  isWithinExamScheduleWindow,
  isBeforeExamScheduleStart,
} = require("./examAssignedStudents");
const { normalizeMode, usesActivityMonitor } = require("./examProctoring");

function durationLimitMs(exam) {
  const mins = Number(exam?.duration_minutes);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  return mins * 60 * 1000;
}

function getSubmissionDurationState(exam, submission) {
  if (!submission || submission.status === "submitted") {
    return {
      duration_minutes: Number(exam?.duration_minutes) || null,
      duration_deadline: null,
      duration_elapsed: false,
      remaining_seconds: null,
    };
  }
  const limitMs = durationLimitMs(exam);
  if (!submission.started_at || !limitMs) {
    return {
      duration_minutes: Number(exam?.duration_minutes) || null,
      duration_deadline: null,
      duration_elapsed: false,
      remaining_seconds: null,
    };
  }
  const startedMs = new Date(submission.started_at).getTime();
  const deadlineMs = startedMs + limitMs;
  const remainingMs = deadlineMs - Date.now();
  return {
    duration_minutes: Number(exam.duration_minutes),
    duration_deadline: new Date(deadlineMs).toISOString(),
    duration_elapsed: remainingMs <= 0,
    remaining_seconds: Math.max(0, Math.floor(remainingMs / 1000)),
  };
}

/**
 * If draft past duration, mark submitted (keeps saved answers). Used when listing exams or opening paper.
 */
async function logProctoringEvent(attempt, event_type, event_data = {}) {
  if (!attempt?.id) return;
  const now = new Date();
  await ExamSessionLog.create({
    exam_attempt_id: attempt.id,
    event_type,
    event_data,
    event_timestamp: now,
  });
  const patch = { last_activity_at: now };
  if (event_type === "session_submit") {
    patch.client_presence_active = false;
  } else if (event_type !== "session_submit") {
    patch.client_presence_active = true;
  }
  if (event_type === "violation_detected" && event_data?.type === "tab_switch") {
    patch.tab_switch_count = Number(attempt.tab_switch_count || 0) + 1;
    patch.warning_count = Number(attempt.warning_count || 0) + 1;
  }
  await attempt.update(patch);
}

/**
 * Keep exam_attempts + session logs aligned with submission state (monitored / strict exams).
 */
async function syncProctoringAttemptWithSubmission(exam, studentId, submission, options = {}) {
  if (!exam || !studentId || !usesActivityMonitor(normalizeMode(exam.proctoring_mode))) return null;
  const submitReason = options.submitReason || null;

  let attempt = await ExamAttempt.findOne({
    where: { exam_id: exam.id, student_id: studentId },
    order: [["created_at", "DESC"]],
  });

  if (submission?.status === "submitted") {
    const submittedAt = submission.submitted_at ? new Date(submission.submitted_at) : new Date();
    const startedAt = submission.started_at ? new Date(submission.started_at) : submittedAt;
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: studentId,
        status: "completed",
        start_time: startedAt,
        end_time: submittedAt,
        submitted_at: submittedAt,
        last_activity_at: submittedAt,
        client_presence_active: false,
        webcam_enabled: false,
      });
    } else if (!attempt.submitted_at || attempt.status !== "completed") {
      await attempt.update({
        status: "completed",
        start_time: attempt.start_time || startedAt,
        submitted_at: submittedAt,
        end_time: submittedAt,
        last_activity_at: submittedAt,
        client_presence_active: false,
      });
    }
    const startLog = await ExamSessionLog.findOne({
      where: { exam_attempt_id: attempt.id, event_type: "session_start" },
      attributes: ["id"],
    });
    if (!startLog) {
      await logProctoringEvent(attempt, "session_start", { source: "sync", recovered: true });
    }
    const submitLog = await ExamSessionLog.findOne({
      where: { exam_attempt_id: attempt.id, event_type: "session_submit" },
      attributes: ["id"],
    });
    if (!submitLog) {
      await logProctoringEvent(attempt, "session_submit", {
        reason: submitReason || "submitted",
        source: options.viaAutoDuration ? "duration_elapsed" : "sync",
      });
    }
    return attempt;
  }

  if (submission?.status === "draft" && submission.started_at) {
    const startedAt = new Date(submission.started_at);
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: studentId,
        status: "in_progress",
        start_time: startedAt,
        last_activity_at: new Date(),
        client_presence_active: true,
        webcam_enabled: false,
      });
      await logProctoringEvent(attempt, "session_start", { source: "sync" });
    } else if (!attempt.start_time || attempt.status === "pending") {
      await attempt.update({
        status: "in_progress",
        start_time: attempt.start_time || startedAt,
        last_activity_at: new Date(),
        client_presence_active: true,
      });
      const startLog = await ExamSessionLog.findOne({
        where: { exam_attempt_id: attempt.id, event_type: "session_start" },
        attributes: ["id"],
      });
      if (!startLog) await logProctoringEvent(attempt, "session_start", { source: "sync" });
    }
  }
  return attempt;
}

function latestAttemptByStudent(attempts) {
  const map = new Map();
  for (const a of attempts) {
    if (!map.has(a.student_id)) map.set(a.student_id, a);
  }
  return map;
}

async function autoSubmitElapsedDraftIfNeeded(submission, exam, studentId) {
  if (!submission || submission.status !== "draft" || !exam) return submission;
  const state = getSubmissionDurationState(exam, submission);
  if (!state.duration_elapsed) return submission;

  const startedMs = new Date(submission.started_at).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const now = new Date();
  await submission.update({
    status: "submitted",
    submitted_at: now,
    time_spent_seconds: elapsedSeconds,
  });

  await syncProctoringAttemptWithSubmission(exam, studentId, submission, {
    submitReason: "auto_submit_time_elapsed",
    viaAutoDuration: true,
  });

  return submission;
}

function buildStudentExamAccess(exam, submission, scheduleRow = {}, attempt = null) {
  const duration = getSubmissionDurationState(exam, submission);
  const scheduleEndMs = scheduleRow.end_time ? new Date(scheduleRow.end_time).getTime() : null;
  const scheduleWindowElapsed = Number.isFinite(scheduleEndMs) ? Date.now() > scheduleEndMs : false;
  const submitted =
    submission?.status === "submitted" ||
    Boolean(submission?.submitted_at) ||
    attempt?.status === "completed" ||
    Boolean(attempt?.submitted_at);
  const sessionStatus = String(scheduleRow.session_status || scheduleRow.status || "").toLowerCase();
  const sessionOpen = ["scheduled", "live"].includes(sessionStatus);
  const inScheduleWindow = isWithinExamScheduleWindow(scheduleRow);
  const beforeStart = isBeforeExamScheduleStart(scheduleRow);

  let can_open = true;
  let open_block_reason = null;

  if (beforeStart) {
    can_open = false;
    open_block_reason = "schedule_not_started";
  } else if (submitted) {
    can_open = false;
    open_block_reason = "already_submitted";
  } else if (duration.duration_elapsed && !inScheduleWindow) {
    can_open = false;
    open_block_reason = "duration_elapsed";
  } else if (scheduleWindowElapsed) {
    can_open = false;
    open_block_reason = "schedule_window_elapsed";
  } else if (!sessionOpen) {
    can_open = false;
    open_block_reason = "session_not_open";
  }

  return {
    ...duration,
    can_open,
    open_block_reason,
    submission_status: submission?.status || null,
    submission_started_at: submission?.started_at || null,
    submission_submitted_at: submission?.submitted_at || null,
    schedule_window_elapsed: scheduleWindowElapsed,
    schedule_window_open: inScheduleWindow,
  };
}

module.exports = {
  getSubmissionDurationState,
  autoSubmitElapsedDraftIfNeeded,
  buildStudentExamAccess,
  syncProctoringAttemptWithSubmission,
  logProctoringEvent,
  latestAttemptByStudent,
};
