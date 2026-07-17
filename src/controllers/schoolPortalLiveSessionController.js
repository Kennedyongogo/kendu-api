const { Op } = require("sequelize");
const {
  LiveClass,
  Student,
  LiveClassAttendance,
  CurriculumClassTimetableLesson,
  CurriculumClassTimetable,
  CurriculumSubject,
} = require("../models");
const { assertStudentCanJoinLessonWindow } = require("../utils/lessonJoinWindow");
const { loadLiveClassForAccess, assertStudentCanAccessLiveClass } = require("../services/liveClassAudience");

/** Match student join URL to stored row (strip #fragments and trailing slashes). */
function normalizeJoinUrlForMatch(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const noHash = s.split("#")[0].trim();
  return noHash.replace(/\/+$/, "");
}

async function findLiveClassById(liveClassId) {
  if (!liveClassId) return null;
  return loadLiveClassForAccess(liveClassId);
}

async function findLiveClassForJoin(joinUrlRaw) {
  const key = normalizeJoinUrlForMatch(joinUrlRaw);
  if (!key) return null;

  const liveClassIdMatch = key.match(/\/live-class\/([0-9a-f-]{36})/i);
  if (liveClassIdMatch) {
    return findLiveClassById(liveClassIdMatch[1]);
  }

  const candidates = await LiveClass.findAll({
    where: {
      join_url: { [Op.ne]: null },
      curriculum_class_timetable_lesson_id: { [Op.ne]: null },
    },
    order: [["created_at", "DESC"]],
    limit: 150,
    include: [
      {
        model: CurriculumClassTimetableLesson,
        as: "timetable_lesson",
        required: true,
        attributes: ["id"],
        include: [
          {
            model: CurriculumClassTimetable,
            as: "timetable",
            required: true,
            attributes: ["id", "curriculum_class_id"],
          },
        ],
      },
    ],
  });

  for (const row of candidates) {
    const stored = normalizeJoinUrlForMatch(row.join_url || "");
    if (stored === key) return row;
  }
  return null;
}

async function resolveLiveClassFromBody(body) {
  const live_class_id = body?.live_class_id != null ? String(body.live_class_id).trim() : "";
  if (live_class_id) {
    return findLiveClassById(live_class_id);
  }
  const join_url = body?.join_url != null ? String(body.join_url).trim() : "";
  if (join_url) {
    return findLiveClassForJoin(join_url);
  }
  return null;
}

async function assertStudentCanJoinLive(student, live, userId) {
  if (!live) {
    const err = new Error("No active live lesson matches this session.");
    err.statusCode = 404;
    throw err;
  }
  await assertStudentCanAccessLiveClass(student, live, { userId });
}

/** Student-only: records join for roster when entering the live class room. */
exports.recordLiveSessionJoin = async (req, res) => {
  try {
    const live_class_id = req.body?.live_class_id != null ? String(req.body.live_class_id).trim() : "";
    const join_url = req.body?.join_url != null ? String(req.body.join_url).trim() : "";
    if (!live_class_id && !join_url) {
      return res.status(400).json({
        success: false,
        message: "live_class_id or join_url is required",
      });
    }

    const student = await Student.findOne({
      where: { user_id: req.user.id },
      attributes: ["id", "user_id", "curriculum_class_id", "curriculum_class_level_id"],
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }

    const live = await resolveLiveClassFromBody(req.body);
    await assertStudentCanJoinLive(student, live, req.user.id);

    const lesson = live.timetable_lesson;
    if (lesson) {
      assertStudentCanJoinLessonWindow({
        lesson_date: lesson.lesson_date,
        starts_at: lesson.starts_at,
        ends_at: lesson.ends_at,
        timezone: lesson.timezone,
        session_status: live.session_status,
      });
    }

    const now = new Date();
    const [row, created] = await LiveClassAttendance.findOrCreate({
      where: { live_class_id: live.id, student_id: student.id },
      defaults: {
        join_time: now,
        leave_time: null,
        duration_minutes: null,
        left_early: false,
      },
    });

    if (!created) {
      await row.update({
        join_time: now,
        leave_time: null,
        duration_minutes: null,
        left_early: false,
      });
      await row.reload();
    } else {
      await LiveClass.increment("attendance_count", { where: { id: live.id } });
      await row.reload();
    }

    if (live.session_status === "scheduled") {
      await live.update({ session_status: "live" });
    }

    return res.json({
      success: true,
      data: {
        live_class_id: live.id,
        attendance_id: row.id,
        join_time: row.join_time,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

/** Student marks leaving the live class room. */
exports.recordLiveSessionLeave = async (req, res) => {
  try {
    const live_class_id = req.body?.live_class_id != null ? String(req.body.live_class_id).trim() : "";
    const join_url = req.body?.join_url != null ? String(req.body.join_url).trim() : "";
    if (!live_class_id && !join_url) {
      return res.status(400).json({
        success: false,
        message: "live_class_id or join_url is required",
      });
    }

    const student = await Student.findOne({
      where: { user_id: req.user.id },
      attributes: ["id", "curriculum_class_id"],
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }

    const live = await resolveLiveClassFromBody(req.body);
    await assertStudentCanJoinLive(student, live, req.user.id);

    const row = await LiveClassAttendance.findOne({
      where: { live_class_id: live.id, student_id: student.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "No join record found." });
    }

    const leave = new Date();
    const joinTime = row.join_time ? new Date(row.join_time) : leave;
    const durationMinutes = Math.max(0, Math.round((leave.getTime() - joinTime.getTime()) / 60000));

    await row.update({
      leave_time: leave,
      duration_minutes: durationMinutes,
      left_early: false,
    });

    return res.json({ success: true, data: row });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
