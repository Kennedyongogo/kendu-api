const {
  Exam,
  Teacher,
  User,
  ExamAttempt,
  ExamSubmission,
  Student,
  InAppNotification,
  ExamSessionLog,
} = require("../models");
const { Op } = require("sequelize");
const crypto = require("crypto");
const { isConfigured: liveKitConfigured } = require("../services/livekitService");
const { resolveExamMeetingUrls } = require("../utils/examMeeting");
const { examDetailIncludes } = require("../utils/examIncludes");
const {
  normalizeMode,
  usesActivityMonitor,
  MODE_LABELS,
  markActivityExamInvigilatorPresent,
  isTeacherAttendedForHr,
  teacherAttendedAtForExam,
} = require("../utils/examProctoring");
const {
  syncProctoringAttemptWithSubmission,
  latestAttemptByStudent,
} = require("../utils/examSubmissionDuration");
async function teacherProfileFromReq(req) {
  if (req.user?.role !== "teacher") return null;
  return Teacher.findOne({ where: { user_id: req.user.id }, attributes: ["id", "user_id"] });
}

async function enforceTeacherExamOwnership(req, exam) {
  if (req.user?.role !== "teacher") return null;
  const teacherProfile = await teacherProfileFromReq(req);
  if (!teacherProfile) {
    return { ok: false, code: 403, message: "Teacher profile not found for this user." };
  }
  if (String(exam?.teacher_id || "") !== String(teacherProfile.id)) {
    return { ok: false, code: 403, message: "Forbidden: this exam is assigned to another invigilator." };
  }
  return { ok: true, teacherProfile };
}

const addDaysIso = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

exports.listOnlineExamsUpcoming = async (req, res) => {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    let from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = todayIso;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 28));
    const toIso = addDaysIso(from, days);
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit, 10) || 60));

    const rows = await Exam.findAll({
      where: {
        is_active: true,
        session_status: { [Op.in]: ["scheduled", "live"] },
        [Op.or]: [
          { proctoring_mode: { [Op.in]: ["record_only", "live_monitor", "strict_auto"] } },
          { meeting_provider: { [Op.not]: null } },
        ],
        start_time: {
          [Op.between]: [new Date(`${from}T00:00:00.000Z`), new Date(`${toIso}T23:59:59.999Z`)],
        },
      },
      include: examDetailIncludes,
      order: [["start_time", "ASC"]],
      limit,
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.initiateOnlineExam = async (req, res) => {
  try {
    const row = await Exam.findByPk(req.params.id, {
      attributes: [
        "id",
        "title",
        "session_status",
        "is_active",
        "meeting_id",
        "meeting_provider",
        "meeting_join_url",
        "meeting_host_url",
        "teacher_id",
        "proctoring_mode",
      ],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    const ownership = await enforceTeacherExamOwnership(req, row);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }
    if (!row.is_active) {
      return res.status(400).json({ success: false, message: "Exam is inactive" });
    }
    if (row.session_status === "cancelled" || row.session_status === "completed") {
      return res.status(400).json({ success: false, message: `Cannot initiate a ${row.session_status} exam` });
    }
    const urls = resolveExamMeetingUrls(req.body, row, { preferLiveKit: true });
    if (!urls.meeting_join_url) {
      const liveKitHint = liveKitConfigured()
        ? ""
        : " Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in server .env.";
      return res.status(400).json({
        success: false,
        message: `No meeting URL available. Set ONLINE_MEETING_PLATFORM=livekit${liveKitHint} Or send meeting_join_url in the request body.`,
      });
    }

    const patch = {
      session_status: "live",
      updated_by: req.user?.id || null,
      meeting_provider: urls.meeting_provider,
      meeting_join_url: urls.meeting_join_url,
      meeting_host_url: urls.meeting_host_url,
    };
    if (urls.meeting_id) patch.meeting_id = urls.meeting_id;

    await row.update(patch);
    const updated = await Exam.findByPk(row.id, { include: examDetailIncludes });
    return res.json({ success: true, data: updated, generated: urls.generated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.notifyOnlineExamClass = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const noteExtra = body.note != null ? String(body.note).trim().slice(0, 2000) : "";

    const row = await Exam.findByPk(id, { include: examDetailIncludes });
    if (!row) return res.status(404).json({ success: false, message: "Exam not found" });
    const ownership = await enforceTeacherExamOwnership(req, row);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }
    if (!row.curriculum_class_id) {
      return res.status(400).json({ success: false, message: "Exam has no curriculum class." });
    }
    const joinUrl =
      (row.meeting_join_url && String(row.meeting_join_url).trim()) ||
      (body.meeting_join_url != null && String(body.meeting_join_url).trim()) ||
      "";
    if (!joinUrl) {
      return res.status(400).json({
        success: false,
        message: "No join URL yet. Prepare meeting links first (Initiate / open links), or include meeting_join_url in the request body.",
      });
    }

    const students = await Student.findAll({
      where: { curriculum_class_id: row.curriculum_class_id },
      attributes: ["id", "user_id"],
    });

    const examTitle = row.title || "Online exam";
    const dateLabel = row.start_time ? new Date(row.start_time).toISOString().slice(0, 10) : "";
    const title = `Online exam: ${examTitle}`;
    let message = dateLabel ? `${examTitle} · ${dateLabel}\n\nJoin: ${joinUrl}` : `${examTitle}\n\nJoin: ${joinUrl}`;
    if (noteExtra) message += `\n\n${noteExtra}`;

    let inApp = 0;
    const errors = [];
    for (const st of students) {
      try {
        await InAppNotification.create({
          user_id: st.user_id,
          title,
          message,
          type: "info",
          action_url: joinUrl.length > 500 ? joinUrl.slice(0, 500) : joinUrl,
        });
        inApp += 1;
      } catch (e) {
        errors.push({ student_id: st.id, step: "in_app", message: e.message });
      }
    }
    return res.json({
      success: true,
      data: {
        students_targeted: students.length,
        in_app_notifications_created: inApp,
        errors: errors.length ? errors : undefined,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOnlineExamTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Exam.findByPk(id, { include: examDetailIncludes });
    if (!row) return res.status(404).json({ success: false, message: "Exam not found" });
    const ownership = await enforceTeacherExamOwnership(req, row);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }

    const attempts = await ExamAttempt.findAll({
      where: { exam_id: row.id },
      order: [["start_time", "DESC"]],
      include: [
        {
          model: Student,
          as: "student",
          attributes: ["id", "admission_number", "user_id"],
          include: [{ model: User, as: "user", attributes: { exclude: ["password_hash"] } }],
        },
      ],
      attributes: ["id", "student_id", "status", "start_time", "end_time", "time_spent_seconds", "submitted_at", "created_at"],
    });

    const recordings = Array.isArray(row.proctoring_rules_json?.recordings) ? row.proctoring_rules_json.recordings : [];

    return res.json({
      success: true,
      data: {
        exam: row,
        exam_schedule: row,
        attendance_rows: attempts.map((a) => ({
          id: a.id,
          student: a.student || null,
          join_time: a.start_time,
          leave_time: a.end_time,
          duration_minutes: a.time_spent_seconds != null ? Math.round(Number(a.time_spent_seconds) / 60) : null,
          status: a.start_time || a.status === "completed" ? "Attended" : "Pending",
          submitted_at: a.submitted_at || null,
        })),
        recordings,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createOnlineExamRecording = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const recording_url =
      body.recording_url != null && String(body.recording_url).trim() !== "" ? String(body.recording_url).trim() : "";
    if (!recording_url) {
      return res.status(400).json({ success: false, message: "recording_url is required" });
    }
    const row = await Exam.findByPk(id);
    if (!row) return res.status(404).json({ success: false, message: "Exam not found" });
    const ownership = await enforceTeacherExamOwnership(req, row);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }
    let duration_seconds = 0;
    if (body.duration_seconds != null && body.duration_seconds !== "") {
      const n = parseInt(body.duration_seconds, 10);
      if (Number.isFinite(n) && n >= 0) duration_seconds = n;
    }
    const prev = row.proctoring_rules_json && typeof row.proctoring_rules_json === "object" ? row.proctoring_rules_json : {};
    const recordings = Array.isArray(prev.recordings) ? [...prev.recordings] : [];
    recordings.unshift({
      id: crypto.randomUUID(),
      recording_url: recording_url.slice(0, 500),
      duration_seconds,
      created_at: new Date().toISOString(),
      created_by: req.user?.id || null,
    });
    await row.update({ proctoring_rules_json: { ...prev, recordings }, updated_by: req.user?.id || null });
    return res.status(201).json({ success: true, data: recordings[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamProctorMonitor = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findByPk(id, { include: examDetailIncludes });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const ownership = await enforceTeacherExamOwnership(req, exam);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }
    if (!exam.curriculum_class_id) {
      return res.status(400).json({ success: false, message: "Exam has no curriculum class." });
    }

    const proctoringMode = normalizeMode(exam.proctoring_mode) || "record_only";
    if (!usesActivityMonitor(proctoringMode)) {
      return res.status(400).json({
        success: false,
        message:
          "This exam uses live video invigilation (LiveKit). Use the invigilation room to monitor students — not this activity panel.",
        code: "live_invigilation_only",
        data: { proctoring_mode: proctoringMode },
      });
    }

    await markActivityExamInvigilatorPresent(exam, {
      userId: req.user?.id || null,
      source: "proctor_monitor",
    });

    const roster = await Student.findAll({
      where: { curriculum_class_id: exam.curriculum_class_id },
      attributes: ["id", "admission_number", "user_id"],
      include: [{ model: User, as: "user", attributes: ["id", "full_name", "username", "email"] }],
      order: [[{ model: User, as: "user" }, "full_name", "ASC"]],
    });

    const submissions = await ExamSubmission.findAll({
      where: { exam_id: exam.id },
      attributes: ["id", "student_id", "status", "started_at", "submitted_at", "updated_at"],
      order: [["updated_at", "DESC"]],
    });
    const submissionByStudent = new Map();
    for (const sub of submissions) {
      if (!submissionByStudent.has(sub.student_id)) submissionByStudent.set(sub.student_id, sub);
    }
    await Promise.all(
      [...submissionByStudent.values()].map((sub) =>
        syncProctoringAttemptWithSubmission(exam, sub.student_id, sub)
      )
    );

    const attempts = await ExamAttempt.findAll({
      where: { exam_id: exam.id },
      attributes: [
        "id",
        "student_id",
        "status",
        "start_time",
        "end_time",
        "submitted_at",
        "webcam_enabled",
        "tab_switch_count",
        "warning_count",
        "last_activity_at",
        "client_presence_active",
        "is_cancelled",
        "cancellation_reason",
      ],
      order: [["created_at", "DESC"]],
    });
    const attemptIds = attempts.map((a) => a.id).filter(Boolean);
    const logs = attemptIds.length
      ? await ExamSessionLog.findAll({
          where: { exam_attempt_id: { [Op.in]: attemptIds } },
          attributes: ["id", "exam_attempt_id", "event_type", "event_timestamp", "event_data"],
          order: [["event_timestamp", "ASC"]],
        })
      : [];
    const logsByAttempt = new Map();
    for (const lg of logs) {
      const key = lg.exam_attempt_id;
      if (!logsByAttempt.has(key)) logsByAttempt.set(key, []);
      logsByAttempt.get(key).push(lg);
    }
    const attemptByStudent = latestAttemptByStudent(attempts);

    const rows = roster.map((s) => {
      const a = attemptByStudent.get(s.id);
      const sub = submissionByStudent.get(s.id);
      const submitted = sub?.status === "submitted" || !!(a?.submitted_at) || a?.status === "completed";
      const inProgress =
        !submitted &&
        !a?.is_cancelled &&
        (sub?.status === "draft" && sub?.started_at) &&
        (a?.status === "in_progress" || !a || !!a?.client_presence_active);
      const started = submitted || inProgress || !!(a?.start_time);
      const status = a?.is_cancelled
        ? "closed"
        : submitted
          ? "submitted"
          : inProgress
            ? "in_progress"
            : started
              ? "in_progress"
              : "not_started";
      const sessionLogs = a?.id ? logsByAttempt.get(a.id) || [] : [];
      return {
        student: s,
        attempt: a || null,
        submission: sub || null,
        status,
        tab_switch_count: a?.tab_switch_count ?? 0,
        warning_count: a?.warning_count ?? 0,
        webcam_enabled: a?.webcam_enabled ?? false,
        last_activity_at: a?.last_activity_at ?? sub?.submitted_at ?? sub?.updated_at ?? sub?.started_at ?? null,
        is_cancelled: !!a?.is_cancelled,
        cancellation_reason: a?.cancellation_reason || null,
        session_log_count: sessionLogs.length,
        session_logs: sessionLogs,
        paper_submitted: sub?.status === "submitted",
      };
    });

    const summary = rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.status === "not_started") acc.not_started += 1;
        else if (r.status === "submitted" || r.status === "completed") acc.submitted += 1;
        else acc.in_progress += 1;
        return acc;
      },
      { total: 0, not_started: 0, in_progress: 0, submitted: 0 }
    );

    return res.json({
      success: true,
      data: {
        exam,
        exam_schedule: exam,
        proctoring_mode: proctoringMode,
        proctoring_mode_label: MODE_LABELS[proctoringMode] || proctoringMode,
        summary,
        roster_rows: rows,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamAttendance = async (req, res) => {
  try {
    const row = await Exam.findByPk(req.params.id, { include: examDetailIncludes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    const ownership = await enforceTeacherExamOwnership(req, row);
    if (ownership && ownership.ok === false) {
      return res.status(ownership.code).json({ success: false, message: ownership.message });
    }

    const attempts = await ExamAttempt.findAll({
      where: { exam_id: row.id },
      include: [
        {
          model: Student,
          as: "student",
          required: false,
          include: [{ model: User, as: "user", attributes: ["id", "full_name", "username", "email"] }],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const submissions = await ExamSubmission.findAll({
      where: { exam_id: row.id },
      attributes: ["id", "student_id", "status", "started_at", "submitted_at"],
      order: [["created_at", "DESC"]],
    });

    const attendanceByStudent = new Map();
    for (const a of attempts) {
      const sid = a.student_id;
      if (!sid) continue;
      if (!attendanceByStudent.has(sid)) {
        attendanceByStudent.set(sid, {
          student_id: sid,
          student_name: a.student?.user?.full_name || a.student?.user?.username || "Student",
          attended: false,
          source: [],
          started_at: null,
          submitted_at: null,
          status: null,
        });
      }
      const item = attendanceByStudent.get(sid);
      item.source.push("exam_attempts");
      item.status = a.status || item.status;
      item.started_at = a.start_time || item.started_at;
      item.submitted_at = a.submitted_at || item.submitted_at;
      if (a.start_time || a.status === "in_progress" || a.status === "completed" || a.status === "submitted") {
        item.attended = true;
      }
    }

    for (const s of submissions) {
      const sid = s.student_id;
      if (!sid) continue;
      if (!attendanceByStudent.has(sid)) {
        attendanceByStudent.set(sid, {
          student_id: sid,
          student_name: "Student",
          attended: false,
          source: [],
          started_at: null,
          submitted_at: null,
          status: null,
        });
      }
      const item = attendanceByStudent.get(sid);
      item.source.push("exam_submissions");
      item.status = s.status || item.status;
      item.started_at = s.started_at || item.started_at;
      item.submitted_at = s.submitted_at || item.submitted_at;
      if (s.started_at || s.status === "submitted" || s.status === "draft") {
        item.attended = true;
      }
    }

    const students = Array.from(attendanceByStudent.values());
    const attendedCount = students.filter((s) => s.attended).length;

    return res.json({
      success: true,
      data: {
        exam_id: row.id,
        exam_schedule_id: row.id,
        session_status: row.session_status,
        invigilator: row.teacher || null,
        invigilator_attended: isTeacherAttendedForHr(row),
        invigilator_attended_at: teacherAttendedAtForExam(row),
        students,
        totals: {
          total_students_seen: students.length,
          attended_students: attendedCount,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
