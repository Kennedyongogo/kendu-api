const {
  Student,
  CurriculumClassTimetableLesson,
  CurriculumClassTimetable,
  CurriculumClass,
  CurriculumClassLevel,
  Curriculum,
  CurriculumSubject,
  Teacher,
  User,
  LiveClass,
  LiveClassAttendance,
  Exam,
  ExamAttempt,
  ExamSubmission,
} = require("../models");
const { Op } = require("sequelize");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function studentExamSortTimestamp(row) {
  for (const key of ["start_time", "created_at", "end_time", "updated_at"]) {
    const t = row?.[key] ? new Date(row[key]).getTime() : NaN;
    if (Number.isFinite(t)) return t;
  }
  return 0;
}
const { getLessonJoinWindow } = require("../utils/lessonJoinWindow");
const { examAccessPolicyForMode, normalizeMode } = require("../utils/examProctoring");
const { isPdfFormExam } = require("../utils/examPdfForm");
const { loadStudentExamResultForPortal } = require("../utils/studentExamResult");
const { generateExamResultPdfBuffer } = require("../services/examResultPdf");
const fs = require("fs");
const path = require("path");
const {
  autoSubmitElapsedDraftIfNeeded,
  buildStudentExamAccess,
} = require("../utils/examSubmissionDuration");
const {
  isStudentAssignedToExam,
  indexSubmissionsByExam,
} = require("../utils/examAssignedStudents");
const { timetableWhereForStudent } = require("../utils/lessonTermRoster");

function mapStudentTimetableLesson(l, student) {
  const live = Array.isArray(l.live_sessions) && l.live_sessions.length ? l.live_sessions[0] : null;
  const attendance =
    live && Array.isArray(live.live_attendances) && live.live_attendances.length
      ? live.live_attendances[0]
      : null;
  const attendanceLabel = attendance ? "Attended" : "Pending";
  const joinWindow =
    live && String(l.delivery_mode || "").toLowerCase() === "online"
      ? getLessonJoinWindow({
          lesson_date: l.lesson_date,
          starts_at: l.starts_at,
          ends_at: l.ends_at,
          timezone: l.timezone,
          session_status: live.session_status,
          live_end_time: live.end_time,
        })
      : { can_join: false, reason: null };
  return {
    id: l.id,
    lesson_date: l.lesson_date,
    starts_at: l.starts_at,
    ends_at: l.ends_at,
    timezone: l.timezone || "Africa/Nairobi",
    delivery_mode: l.delivery_mode,
    room: l.room,
    notes: l.notes,
    curriculum: l.timetable?.curriculum_class?.curriculum || null,
    curriculum_class: l.timetable?.curriculum_class || null,
    curriculum_class_level: l.timetable?.curriculum_class_level || null,
    subject: l.curriculum_subject || null,
    teacher: l.teacher || null,
    attendance: attendance
      ? {
          status: attendanceLabel,
          join_time: attendance.join_time,
          leave_time: attendance.leave_time,
          duration_minutes: attendance.duration_minutes,
        }
      : { status: attendanceLabel },
    live_session: live
      ? {
          id: live.id,
          meeting_id: live.meeting_id,
          join_url: live.join_url,
          session_status: live.session_status,
          platform: live.platform,
          end_time: live.end_time,
          created_at: live.created_at,
          can_join: joinWindow.can_join,
          join_blocked_reason: joinWindow.reason,
          join_opens_at: joinWindow.opens_at,
          join_closes_at: joinWindow.closes_at,
        }
      : null,
  };
}

exports.listMyStudentTimetableLessons = async (req, res) => {
  try {
    const student = await Student.findOne({
      where: { user_id: req.user?.id },
      attributes: ["id", "curriculum_id", "curriculum_class_id", "curriculum_class_level_id"],
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }
    if (!student.curriculum_class_id) {
      return res.json({ success: true, data: [] });
    }

    const timetableWhere = timetableWhereForStudent(student);
    if (!timetableWhere) {
      return res.json({ success: true, data: [] });
    }

    const dateFilter = String(req.query?.date || "").trim().slice(0, 10);
    const lessonWhere = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
      lessonWhere.lesson_date = dateFilter;
    }

    const lessons = await CurriculumClassTimetableLesson.findAll({
      where: lessonWhere,
      include: [
        {
          model: CurriculumClassTimetable,
          as: "timetable",
          attributes: ["id", "name", "curriculum_class_id", "curriculum_class_level_id"],
          required: true,
          where: timetableWhere,
          include: [
            {
              model: CurriculumClass,
              as: "curriculum_class",
              attributes: ["id", "name", "code", "curriculum_id"],
              include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"] }],
            },
            {
              model: CurriculumClassLevel,
              as: "curriculum_class_level",
              attributes: ["id", "name", "level_order", "start_date", "end_date"],
              required: false,
            },
          ],
        },
        { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
        {
          model: Teacher,
          as: "teacher",
          required: false,
          attributes: ["id"],
          include: [{ model: User, as: "user", ...userSafe }],
        },
        {
          model: LiveClass,
          as: "live_sessions",
          required: false,
          separate: true,
          limit: 1,
          order: [["created_at", "DESC"]],
          attributes: [
            "id",
            "meeting_id",
            "join_url",
            "host_url",
            "session_status",
            "platform",
            "start_time",
            "end_time",
            "created_at",
          ],
          include: [
            {
              model: LiveClassAttendance,
              as: "live_attendances",
              required: false,
              where: { student_id: student.id },
              attributes: ["id", "join_time", "leave_time", "duration_minutes"],
            },
          ],
        },
      ],
      order: dateFilter
        ? [
            ["starts_at", "ASC"],
            ["created_at", "ASC"],
          ]
        : [
            ["lesson_date", "DESC"],
            ["starts_at", "DESC"],
          ],
    });

    const data = lessons.map((l) => mapStudentTimetableLesson(l, student));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load lessons." });
  }
};

exports.listMyStudentExamSchedules = async (req, res) => {
  try {
    const student = await Student.findOne({
      where: { user_id: req.user?.id },
      attributes: ["id", "curriculum_id", "curriculum_class_id", "curriculum_class_level_id"],
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const studentSubmissions = await ExamSubmission.findAll({
      where: { student_id: student.id },
      attributes: ["id", "exam_id", "status", "started_at", "submitted_at"],
      order: [["created_at", "DESC"]],
    });
    const submissionExamIds = [
      ...new Set(
        studentSubmissions
          .filter((s) => s.status === "submitted" || s.submitted_at)
          .map((s) => s.exam_id)
          .filter(Boolean)
      ),
    ];

    if (!student.curriculum_class_id && !submissionExamIds.length) {
      return res.json({ success: true, data: [] });
    }

    const examInclude = [
      { model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"] },
      { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
      { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"] },
      {
        model: Teacher,
        as: "teacher",
        required: false,
        attributes: ["id"],
        include: [{ model: User, as: "user", ...userSafe }],
      },
    ];

    let assignedRows = [];
    if (student.curriculum_class_id) {
      const where = {
        is_active: true,
        curriculum_class_id: student.curriculum_class_id,
        status: "published",
        session_status: { [Op.in]: ["scheduled", "live", "completed"] },
      };
      if (student.curriculum_id) where.curriculum_id = student.curriculum_id;
      if (student.curriculum_class_level_id) {
        where.curriculum_class_level_id = student.curriculum_class_level_id;
      }

      const rows = await Exam.findAll({
        where,
        include: examInclude,
      });
      assignedRows = rows.filter((r) => isStudentAssignedToExam(r, student.id));
    }

    const assignedExamIds = new Set(assignedRows.map((r) => String(r.id)));
    const retainedExamIds = submissionExamIds.filter((id) => !assignedExamIds.has(String(id)));
    const retainedRows = retainedExamIds.length
      ? await Exam.findAll({
          where: { id: { [Op.in]: retainedExamIds } },
          include: examInclude,
        })
      : [];

    const mergedRows = [...assignedRows];
    for (const row of retainedRows) {
      if (!assignedExamIds.has(String(row.id))) mergedRows.push(row);
    }

    const examIds = mergedRows.map((r) => r.id);
    const [attempts, submissions] = await Promise.all([
      examIds.length
        ? ExamAttempt.findAll({
            where: { student_id: student.id, exam_id: examIds },
            attributes: ["id", "exam_id", "status", "start_time", "end_time", "submitted_at", "is_cancelled", "cancellation_reason"],
            order: [["created_at", "DESC"]],
          })
        : [],
      examIds.length
        ? ExamSubmission.findAll({
            where: { student_id: student.id, exam_id: examIds },
            attributes: ["id", "exam_id", "status", "started_at", "submitted_at"],
            order: [["created_at", "DESC"]],
          })
        : [],
    ]);

    const attemptByExam = new Map();
    for (const a of attempts) {
      if (!attemptByExam.has(a.exam_id)) attemptByExam.set(a.exam_id, a);
    }
    const submissionByExam = indexSubmissionsByExam(submissions);

    for (const r of assignedRows) {
      let sub = submissionByExam.get(r.id);
      if (sub?.status === "draft") {
        sub = await autoSubmitElapsedDraftIfNeeded(sub, r, student.id);
        submissionByExam.set(r.id, sub);
      }
    }

    const data = await Promise.all(
      mergedRows.map(async (r) => {
      const isAssigned = isStudentAssignedToExam(r, student.id);
      const att = attemptByExam.get(r.id);
      const sub = submissionByExam.get(r.id);
      const access = buildStudentExamAccess(r, sub, r, att);
      if (!isAssigned) {
        access.can_open = false;
        access.open_block_reason =
          sub?.status === "submitted" || sub?.submitted_at
            ? "already_submitted"
            : "not_assigned";
      }
      const attendance =
        att || sub
          ? {
              status: att?.is_cancelled
                ? "Disqualified"
                : sub?.status === "submitted" || att?.submitted_at || sub?.submitted_at
                  ? "Submitted"
                  : "Attended",
              started_at: att?.start_time || sub?.started_at || null,
              submitted_at: att?.submitted_at || sub?.submitted_at || null,
              attempt_status: att?.status || null,
              is_cancelled: !!att?.is_cancelled,
              cancellation_reason: att?.cancellation_reason || null,
            }
          : { status: "Pending" };
      return {
        id: r.id,
        exam_id: r.id,
        start_time: r.start_time,
        end_time: r.end_time,
        created_at: r.created_at,
        updated_at: r.updated_at,
        timezone: r.timezone,
        status: r.session_status,
        session_status: r.session_status,
        proctoring_mode: r.proctoring_mode,
        requires_webcam: r.requires_webcam,
        prevent_tab_switch: r.prevent_tab_switch,
        effective_requires_webcam: !!r.requires_webcam,
        effective_prevent_tab_switch: !!r.prevent_tab_switch,
        meeting_provider: r.meeting_provider,
        meeting_id: r.meeting_id,
        meeting_join_url: r.meeting_join_url,
        video_mode:
          String(r.meeting_provider || "").toLowerCase() === "livekit"
            ? "livekit"
            : String(r.meeting_provider || "").toLowerCase() === "webrtc"
              ? "webrtc"
              : "external",
        exam_access_policy: examAccessPolicyForMode(normalizeMode(r.proctoring_mode) || "record_only"),
        curriculum: r.curriculum || null,
        curriculum_class: r.curriculum_class || null,
        curriculum_class_level: r.curriculum_class_level || null,
        exam: {
          id: r.id,
          title: r.title,
          status: r.status,
          exam_type: r.exam_type || "questions",
          duration_minutes: r.duration_minutes,
          requires_webcam: r.requires_webcam,
          prevent_tab_switch: r.prevent_tab_switch,
        },
        exam_type: r.exam_type || "questions",
        teacher: r.teacher || null,
        attendance,
        can_open: access.can_open,
        open_block_reason: access.open_block_reason,
        duration_minutes: access.duration_minutes,
        duration_deadline: access.duration_deadline,
        duration_elapsed: access.duration_elapsed,
        remaining_seconds: access.remaining_seconds,
        submission_status: access.submission_status,
        is_assigned: isAssigned,
        retained_by_submission: !isAssigned && Boolean(sub),
      };
    })
    );

    data.sort((a, b) => studentExamSortTimestamp(b) - studentExamSortTimestamp(a));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load exams." });
  }
};

exports.getMyStudentExamResult = async (req, res) => {
  try {
    const examId = req.params.examScheduleId || req.params.examId;
    if (!examId) {
      return res.status(400).json({ success: false, message: "exam id is required." });
    }

    const loaded = await loadStudentExamResultForPortal({ userId: req.user?.id, examId });
    if (loaded.error) {
      return res.status(loaded.error.status).json({
        success: false,
        message: loaded.error.message,
        code: loaded.error.code || null,
      });
    }

    return res.json({ success: true, data: loaded.data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load exam result." });
  }
};

exports.streamMyStudentExamResultPdf = async (req, res) => {
  try {
    const examId = req.params.examScheduleId || req.params.examId;
    if (!examId) {
      return res.status(400).json({ success: false, message: "exam id is required." });
    }

    const loaded = await loadStudentExamResultForPortal({ userId: req.user?.id, examId });
    if (loaded.error) {
      return res.status(loaded.error.status).json({
        success: false,
        message: loaded.error.message,
        code: loaded.error.code || null,
      });
    }

    const pdfBuffer = await generateExamResultPdfBuffer(loaded.data);
    const safeTitle = String(loaded.data.examTitle || "exam")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "exam";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="exam-result-${safeTitle}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not generate exam result PDF." });
  }
};

exports.streamMyStudentExamAnsweredPdf = async (req, res) => {
  try {
    const examId = req.params.examScheduleId || req.params.examId;
    if (!examId) {
      return res.status(400).json({ success: false, message: "exam id is required." });
    }

    const loaded = await loadStudentExamResultForPortal({ userId: req.user?.id, examId });
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    if (!isPdfFormExam(loaded.exam)) {
      return res.status(400).json({ success: false, message: "This exam is not a PDF form exam." });
    }
    const relPath = loaded.submission?.pdf_completed_file_path;
    if (!relPath) {
      return res.status(404).json({ success: false, message: "Answered exam PDF is not available." });
    }
    const absPath = path.join(__dirname, "..", "..", String(relPath).replace(/^\/+/, ""));
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: "Answered exam PDF file not found." });
    }

    const safeTitle = String(loaded.data.examTitle || "exam")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "exam";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="exam-answered-${safeTitle}.pdf"`);
    return fs.createReadStream(absPath).pipe(res);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not download answered exam PDF." });
  }
};

