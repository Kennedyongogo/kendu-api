const { Op } = require("sequelize");
const crypto = require("crypto");
const {
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumClassTimetable,
  CurriculumClassTimetableLesson,
  CurriculumSubject,
  Teacher,
  User,
  TeacherCurriculumSubject,
  LiveClass,
  LiveClassAttendance,
  LiveClassRecording,
  Student,
  InAppNotification,
} = require("../models");
const { STAFF_ROLES } = require("../constants/userRoles");
const meetingProvider = require("../services/meetingProvider");
const teamsService = require("../services/teamsService");
const webrtcRoomService = require("../services/webrtcRoomService");
const { isInAppVideoPlatform, defaultOnlineMeetingMode } = require("../utils/meetingPlatform");
const { lessonSlotToDate } = require("../utils/examScheduleTime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

const lessonInclude = [
  {
    model: CurriculumSubject,
    as: "curriculum_subject",
    attributes: ["id", "name", "curriculum_id", "curriculum_class_id", "subject_id"],
  },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

const curriculumClassLevelInclude = {
  model: CurriculumClassLevel,
  as: "curriculum_class_level",
  required: false,
  attributes: ["id", "name", "level_order", "curriculum_class_id"],
};

const timetableIncludesBase = [curriculumClassLevelInclude];

const timetableLessonsInclude = {
  model: CurriculumClassTimetableLesson,
  as: "lessons",
  separate: true,
  order: [
    ["lesson_date", "ASC"],
    ["starts_at", "ASC"],
  ],
  include: lessonInclude,
};

function isoWeekdayFromDateOnly(dateOnlyStr) {
  const parts = String(dateOnlyStr).trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Add calendar days to a YYYY-MM-DD string (UTC date arithmetic). */
function addDaysToIsoDate(isoDateStr, daysToAdd) {
  const parts = String(isoDateStr).trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDateStr;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(daysToAdd) || 0);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function serverLocalTodayIso() {
  const n = new Date();
  const yy = n.getFullYear();
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const dd = String(n.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function timeToSeconds(val) {
  if (val == null || val === "") return null;
  if (typeof val === "string") {
    const t = val.trim().slice(0, 8);
    const segs = t.split(":");
    const hh = Number(segs[0]);
    const mm = Number(segs[1] ?? 0);
    const ss = Number(segs[2] ?? 0);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 3600 + mm * 60 + (Number.isFinite(ss) ? ss : 0);
  }
  if (val instanceof Date) {
    return val.getUTCHours() * 3600 + val.getUTCMinutes() * 60 + val.getUTCSeconds();
  }
  return null;
}

function normalizeDeliveryMode(raw) {
  const s = raw == null ? "" : String(raw).trim().toLowerCase();
  if (s === "online") return "online";
  return "physical";
}

/** optional = no auto camera/mic; audio = mic on join; video = mic + camera on join. */
function normalizeMediaMode(raw) {
  const s = raw == null ? "" : String(raw).trim().toLowerCase();
  if (s === "audio" || s === "video") return s;
  return "optional";
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  const as = timeToSeconds(aStart);
  const ae = timeToSeconds(aEnd);
  const bs = timeToSeconds(bStart);
  const be = timeToSeconds(bEnd);
  if (as == null || ae == null || bs == null || be == null) return false;
  if (ae <= as || be <= bs) return false;
  return as < be && bs < ae;
}

async function assertNoTeacherOverlap({ teacherId, lessonDate, startsAt, endsAt, excludeLessonId }) {
  if (!teacherId || !lessonDate || startsAt == null || endsAt == null || startsAt === "" || endsAt === "") return;

  const rows = await CurriculumClassTimetableLesson.findAll({
    where: {
      teacher_id: teacherId,
      lesson_date: lessonDate,
      starts_at: { [Op.ne]: null },
      ends_at: { [Op.ne]: null },
      ...(excludeLessonId ? { id: { [Op.ne]: excludeLessonId } } : {}),
    },
    attributes: ["id", "starts_at", "ends_at"],
  });

  for (const r of rows) {
    if (intervalsOverlap(startsAt, endsAt, r.starts_at, r.ends_at)) {
      const err = new Error(
        "This teacher already has a lesson that overlaps this time on that date (including other curricula)."
      );
      err.statusCode = 409;
      throw err;
    }
  }
}

async function teacherMayTeachLesson({ teacherId, curriculumSubjectId }) {
  const tcs = await TeacherCurriculumSubject.findOne({
    where: { teacher_id: teacherId, curriculum_subject_id: curriculumSubjectId },
  });
  if (tcs) return { ok: true };
  return {
    ok: false,
    message: "Teacher must be assigned to this curriculum subject",
  };
}

async function loadCurriculumClass(curriculumId, classId) {
  return CurriculumClass.findOne({
    where: { id: classId, curriculum_id: curriculumId },
    attributes: ["id", "curriculum_id", "name", "code"],
  });
}

async function subjectAllowedForCurriculumClass(curriculumClass, curriculumSubjectId) {
  const sub = await CurriculumSubject.findByPk(curriculumSubjectId);
  if (!sub || sub.curriculum_id !== curriculumClass.curriculum_id) {
    return { ok: false, message: "curriculum_subject does not belong to this curriculum" };
  }
  if (sub.curriculum_class_id != null && sub.curriculum_class_id !== curriculumClass.id) {
    return { ok: false, message: "curriculum_subject is scoped to a different curriculum class" };
  }
  return { ok: true, subject: sub };
}

async function loadTimetableInClass(curriculumId, classId, timetableId) {
  const curriculumClass = await loadCurriculumClass(curriculumId, classId);
  if (!curriculumClass) return { error: { status: 404, message: "Curriculum class not found" } };
  const timetable = await CurriculumClassTimetable.findOne({
    where: { id: timetableId, curriculum_class_id: classId },
  });
  if (!timetable) return { error: { status: 404, message: "Timetable not found" } };
  return { curriculumClass, timetable };
}

const dayViewLessonInclude = [
  {
    model: CurriculumClassTimetable,
    as: "timetable",
    attributes: ["id", "name", "curriculum_class_id", "curriculum_class_level_id"],
    include: [
      {
        model: CurriculumClass,
        as: "curriculum_class",
        attributes: ["id", "name", "code", "curriculum_id"],
        include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name"] }],
      },
      {
        model: CurriculumClassLevel,
        as: "curriculum_class_level",
        required: false,
        attributes: ["id", "name", "level_order"],
      },
    ],
  },
  {
    model: CurriculumSubject,
    as: "curriculum_subject",
    attributes: ["id", "name"],
  },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

const liveSessionsLatestInclude = {
  model: LiveClass,
  as: "live_sessions",
  separate: true,
  limit: 1,
  order: [["created_at", "DESC"]],
  required: false,
  attributes: ["id", "join_url", "host_url", "session_status", "platform", "meeting_id", "created_at"],
};

const onlineUpcomingLessonInclude = [...dayViewLessonInclude, liveSessionsLatestInclude];

async function teacherProfileFromReq(req) {
  return Teacher.findOne({ where: { user_id: req.user.id } });
}

async function assertCanInitiateOnlineLive(req, lesson) {
  if (!lesson) {
    const err = new Error("Timetable lesson not found");
    err.statusCode = 404;
    throw err;
  }
  if (lesson.delivery_mode !== "online") {
    const err = new Error("This lesson is not scheduled as online delivery");
    err.statusCode = 400;
    throw err;
  }
  if (STAFF_ROLES.includes(req.user.role)) return;
  const tp = await teacherProfileFromReq(req);
  if (!tp) {
    const err = new Error("Teacher profile required");
    err.statusCode = 403;
    throw err;
  }
  if (!lesson.teacher_id) {
    const err = new Error("Assign a teacher to this lesson first, or ask an administrator to start the session.");
    err.statusCode = 403;
    throw err;
  }
  if (lesson.teacher_id !== tp.id) {
    const err = new Error("You can only start a live session for your own lessons");
    err.statusCode = 403;
    throw err;
  }
}

const { studentWhereForLessonTimetable } = require("../utils/lessonTermRoster");

function lessonWindowDates(lesson) {
  const timezone = lesson?.timezone || "Africa/Nairobi";
  const start_time = lessonSlotToDate(lesson?.lesson_date, lesson?.starts_at, timezone);
  const end_time = lessonSlotToDate(lesson?.lesson_date, lesson?.ends_at, timezone);
  if (!start_time || !end_time) return null;
  if (end_time <= start_time) {
    return { start_time, end_time: new Date(start_time.getTime() + 3600000) };
  }
  return { start_time, end_time };
}

function normalizeMeetingPlatform(raw) {
  const s = raw == null ? "" : String(raw).trim().toLowerCase().replace(/-/g, "_");
  if (s === "zoom") return "zoom";
  if (s === "google_meet" || s === "googlemeet" || s === "meet") return "google_meet";
  if (s === "teams" || s === "microsoft_teams") return "teams";
  if (s === "jitsi") return "jitsi";
  if (s === "webrtc") return "webrtc";
  if (s === "livekit") return "livekit";
  return "other";
}

function provisionInAppLesson(lesson, platform = "livekit") {
  const p = webrtcRoomService.provisionForLesson(lesson.id, platform);
  return {
    meeting_id: p.meeting_id,
    join_url: "",
    host_url: "",
    platform: p.platform,
  };
}

function shouldFallbackTeamsToLiveKit(err) {
  if (process.env.ONLINE_MEETING_TEAMS_FALLBACK_LIVEKIT === "0") return false;
  if (err?.teamsAccessPolicyBlocked) return true;
  const msg = String(err?.message || "");
  return (
    err?.statusCode === 503 ||
    err?.statusCode === 502 ||
    /application access policy/i.test(msg) ||
    /Teams meeting creation failed/i.test(msg)
  );
}

/** Default online lesson meetings: LiveKit SFU (or webrtc mesh). Set ONLINE_MEETING_PLATFORM=teams for Microsoft Teams. */
async function tryProvisionMeetingForLesson(lesson) {
  const mode = defaultOnlineMeetingMode();
  if (mode === "teams") {
    if (!teamsService.isConfigured()) {
      console.warn("[Meeting] Teams not configured — using LiveKit for lesson", lesson?.id);
      return provisionInAppLesson(lesson, "livekit");
    }
    const window = lessonWindowDates(lesson) || {
      start_time: new Date(),
      end_time: new Date(Date.now() + 3600000),
    };
    const title = lesson.curriculum_subject?.name || "Online class";
    try {
      return await teamsService.createMeetingForLesson({
        subject: title,
        startDateTime: window.start_time,
        endDateTime: window.end_time,
      });
    } catch (err) {
      if (shouldFallbackTeamsToLiveKit(err)) {
        console.warn("[Meeting] Teams failed, falling back to LiveKit:", err.message);
        return provisionInAppLesson(lesson, "livekit");
      }
      throw err;
    }
  }
  if (mode === "webrtc" || mode === "livekit") {
    return provisionInAppLesson(lesson, mode);
  }
  if (process.env.JITSI_DISABLED === "1") {
    return null;
  }
  try {
    const classId = lesson.timetable?.curriculum_class?.id || "class";
    const teacherKey = lesson.teacher_id || "unassigned";
    const title = lesson.curriculum_subject?.name || "Lesson";
    const m = await meetingProvider.createMeeting({
      lessonId: lesson.id,
      classId,
      teacherId: teacherKey,
      title,
    });
    return {
      meeting_id: m.meeting_id,
      join_url: m.join_url,
      host_url: m.host_url,
      platform: m.platform,
    };
  } catch (e) {
    console.error("[Meeting] Jitsi provisioning failed:", e.message);
    return null;
  }
}

function resolveMeetingUrls(body, provisionPayload) {
  if (provisionPayload?.join_url && provisionPayload?.host_url) {
    return {
      join_url: provisionPayload.join_url,
      host_url: provisionPayload.host_url,
      meeting_id: provisionPayload.meeting_id || null,
      platform: normalizeMeetingPlatform(provisionPayload.platform),
    };
  }

  if (isInAppVideoPlatform(provisionPayload?.platform) && provisionPayload?.meeting_id) {
    return {
      join_url: provisionPayload.join_url || "",
      host_url: provisionPayload.host_url || "",
      meeting_id: provisionPayload.meeting_id,
      platform: normalizeMeetingPlatform(provisionPayload.platform),
    };
  }

  const join =
    (body?.join_url != null && String(body.join_url).trim()) ||
    (process.env.ONLINE_MEETING_DEFAULT_JOIN_URL && String(process.env.ONLINE_MEETING_DEFAULT_JOIN_URL).trim()) ||
    "";
  const host =
    (body?.host_url != null && String(body.host_url).trim()) ||
    (process.env.ONLINE_MEETING_DEFAULT_HOST_URL && String(process.env.ONLINE_MEETING_DEFAULT_HOST_URL).trim()) ||
    join;
  const platform = normalizeMeetingPlatform(process.env.ONLINE_MEETING_PLATFORM);
  return { join_url: join, host_url: host || join, meeting_id: null, platform };
}

async function resolveLiveHostTeacherId(req, lesson, body) {
  if (lesson.teacher_id) return { teacherId: lesson.teacher_id };
  if (!STAFF_ROLES.includes(req.user.role)) {
    return {
      error: "Assign a teacher to this lesson before starting a live session.",
    };
  }
  const hid = body?.host_teacher_id != null ? String(body.host_teacher_id).trim() : "";
  if (!hid) {
    return {
      error:
        "This lesson has no assigned teacher. Provide host_teacher_id (staff only), or assign a teacher on the timetable.",
    };
  }
  const t = await Teacher.findByPk(hid, { attributes: ["id"] });
  if (!t) return { error: "Invalid host_teacher_id" };
  return { teacherId: hid };
}

exports.listTimetableLessonsByDate = async (req, res) => {
  try {
    const raw = req.query.date;
    const date = raw != null ? String(raw).trim() : "";
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date query parameter is required (YYYY-MM-DD)",
      });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = parseInt(req.query.limit, 10) || 10;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const offset = (page - 1) * limit;

    const total = await CurriculumClassTimetableLesson.count({ where: { lesson_date: date } });

    const rows = await CurriculumClassTimetableLesson.findAll({
      where: { lesson_date: date },
      include: [...dayViewLessonInclude, liveSessionsLatestInclude],
      order: [["starts_at", "ASC"], ["created_at", "ASC"]],
      limit,
      offset,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Online-only timetable slots from `from` through `from + days` (for admin live hub). */
exports.listOnlineTimetableLessonsUpcoming = async (req, res) => {
  try {
    let from = req.query.from != null ? String(req.query.from).trim() : "";
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      from = serverLocalTodayIso();
    }
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 28));
    const toIso = addDaysToIsoDate(from, days);
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit, 10) || 60));

    const rows = await CurriculumClassTimetableLesson.findAll({
      where: {
        delivery_mode: "online",
        lesson_date: { [Op.between]: [from, toIso] },
      },
      include: onlineUpcomingLessonInclude,
      order: [
        ["lesson_date", "ASC"],
        ["starts_at", "ASC"],
      ],
      limit,
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTeachersForCurriculumTimetable = async (req, res) => {
  try {
    const { curriculumId } = req.params;
    const subjectId = req.query.curriculum_subject_id;
    if (!subjectId || String(subjectId).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "curriculum_subject_id query parameter is required",
      });
    }
    const cur = await Curriculum.findByPk(curriculumId, { attributes: ["id"] });
    if (!cur) {
      return res.status(404).json({ success: false, message: "Curriculum not found" });
    }
    const sub = await CurriculumSubject.findByPk(subjectId, { attributes: ["id", "curriculum_id"] });
    if (!sub || sub.curriculum_id !== curriculumId) {
      return res.status(400).json({
        success: false,
        message: "curriculum_subject does not belong to this curriculum",
      });
    }
    const rows = await Teacher.findAll({
      include: [
        {
          model: CurriculumSubject,
          as: "teaching_curriculum_subjects",
          where: { id: subjectId },
          attributes: [],
          through: { attributes: [] },
          required: true,
        },
        { model: User, as: "user", ...userSafe },
      ],
    });
    rows.sort((a, b) => {
      const na = (a.user?.full_name || a.user?.username || "").toLowerCase();
      const nb = (b.user?.full_name || b.user?.username || "").toLowerCase();
      return na.localeCompare(nb);
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCurriculumClassTimetables = async (req, res) => {
  try {
    const { curriculumId, classId } = req.params;
    const cc = await loadCurriculumClass(curriculumId, classId);
    if (!cc) {
      return res.status(404).json({ success: false, message: "Curriculum class not found" });
    }
    const includeLessons = req.query.include_lessons !== "false";
    const rows = await CurriculumClassTimetable.findAll({
      where: { curriculum_class_id: classId },
      include: includeLessons ? [...timetableIncludesBase, timetableLessonsInclude] : timetableIncludesBase,
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCurriculumClassTimetable = async (req, res) => {
  try {
    const { curriculumId, classId } = req.params;
    const cc = await loadCurriculumClass(curriculumId, classId);
    if (!cc) {
      return res.status(404).json({ success: false, message: "Curriculum class not found" });
    }
    const {
      curriculum_class_level_id: levelId,
      name,
      is_active,
      academic_year_id: ayBody,
    } = req.body;

    if (!levelId) {
      return res.status(400).json({ success: false, message: "curriculum_class_level_id is required" });
    }
    const level = await CurriculumClassLevel.findOne({
      where: { id: levelId, curriculum_class_id: classId },
    });
    if (!level) {
      return res.status(400).json({
        success: false,
        message: "curriculum_class_level does not belong to this curriculum class",
      });
    }

    const ayId = ayBody || null;

    const row = await CurriculumClassTimetable.create({
      curriculum_class_id: classId,
      curriculum_class_level_id: levelId,
      academic_year_id: ayId,
      name: name ?? null,
      is_active: is_active !== undefined ? !!is_active : true,
    });
    const created = await CurriculumClassTimetable.findByPk(row.id, {
      include: [...timetableIncludesBase, timetableLessonsInclude],
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getCurriculumClassTimetable = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId } = req.params;
    const { error, timetable } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    const row = await CurriculumClassTimetable.findByPk(timetable.id, {
      include: [
        ...timetableIncludesBase,
        { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code", "curriculum_id"] },
        timetableLessonsInclude,
      ],
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCurriculumClassTimetable = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId } = req.params;
    const { error, timetable } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.is_active !== undefined) patch.is_active = !!req.body.is_active;

    if (req.body.curriculum_class_level_id !== undefined) {
      const lid = req.body.curriculum_class_level_id;
      if (lid === null || lid === "") {
        patch.curriculum_class_level_id = null;
      } else {
        const level = await CurriculumClassLevel.findOne({
          where: { id: lid, curriculum_class_id: classId },
        });
        if (!level) {
          return res.status(400).json({
            success: false,
            message: "curriculum_class_level does not belong to this curriculum class",
          });
        }
        patch.curriculum_class_level_id = lid;
      }
    }

    if (req.body.academic_year_id !== undefined) {
      patch.academic_year_id =
        req.body.academic_year_id === null || req.body.academic_year_id === ""
          ? null
          : req.body.academic_year_id;
    }
    await timetable.update(patch);
    const updated = await CurriculumClassTimetable.findByPk(timetable.id, {
      include: [...timetableIncludesBase, timetableLessonsInclude],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCurriculumClassTimetable = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId } = req.params;
    const { error, timetable } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    await timetable.destroy();
    return res.json({ success: true, message: "Timetable deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTimetableLesson = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId } = req.params;
    const { curriculumClass, timetable, error } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    const {
      lesson_date,
      day_of_week,
      period_index,
      starts_at,
      ends_at,
      curriculum_subject_id,
      teacher_id,
      room,
      notes,
      teacher_attended,
      delivery_mode,
      media_mode,
    } = req.body;

    const lessonTimezone =
      req.body.timezone != null && String(req.body.timezone).trim() !== ""
        ? String(req.body.timezone).trim()
        : "Africa/Nairobi";

    if (!lesson_date || typeof lesson_date !== "string") {
      return res.status(400).json({ success: false, message: "lesson_date is required (YYYY-MM-DD)" });
    }
    if (!curriculum_subject_id) {
      return res.status(400).json({ success: false, message: "curriculum_subject_id is required" });
    }
    if (starts_at == null || ends_at == null || String(starts_at).trim() === "" || String(ends_at).trim() === "") {
      return res.status(400).json({ success: false, message: "starts_at and ends_at are required" });
    }

    const ss = timeToSeconds(starts_at);
    const es = timeToSeconds(ends_at);
    if (ss == null || es == null || es <= ss) {
      return res.status(400).json({ success: false, message: "Invalid times: end must be after start" });
    }

    let d = day_of_week != null ? Number(day_of_week) : null;
    if (d != null && (!Number.isInteger(d) || d < 1 || d > 7)) {
      return res.status(400).json({ success: false, message: "day_of_week must be 1–7 when provided" });
    }
    if (d == null) {
      d = isoWeekdayFromDateOnly(lesson_date);
      if (d == null) {
        return res.status(400).json({ success: false, message: "Invalid lesson_date" });
      }
    }

    let p = period_index != null ? Number(period_index) : null;
    if (p != null && (!Number.isInteger(p) || p < 1)) {
      return res.status(400).json({ success: false, message: "period_index must be a positive integer when provided" });
    }

    const allowed = await subjectAllowedForCurriculumClass(curriculumClass, curriculum_subject_id);
    if (!allowed.ok) {
      return res.status(400).json({ success: false, message: allowed.message });
    }

    if (teacher_id) {
      const tm = await teacherMayTeachLesson({
        teacherId: teacher_id,
        curriculumSubjectId: curriculum_subject_id,
      });
      if (!tm.ok) {
        return res.status(400).json({ success: false, message: tm.message });
      }
      try {
        await assertNoTeacherOverlap({
          teacherId: teacher_id,
          lessonDate: lesson_date,
          startsAt: starts_at,
          endsAt: ends_at,
        });
      } catch (e) {
        const code = e.statusCode || 400;
        return res.status(code).json({ success: false, message: e.message });
      }
    }

    const row = await CurriculumClassTimetableLesson.create({
      timetable_id: timetable.id,
      lesson_date,
      day_of_week: d,
      period_index: p,
      starts_at,
      ends_at,
      curriculum_subject_id,
      teacher_id: teacher_id || null,
      room: room ?? null,
      notes: notes ?? null,
      teacher_attended: teacher_attended !== undefined ? !!teacher_attended : false,
      delivery_mode: normalizeDeliveryMode(delivery_mode),
      media_mode:
        normalizeDeliveryMode(delivery_mode) === "online"
          ? normalizeMediaMode(media_mode)
          : "optional",
      timezone: lessonTimezone,
    });

    const created = await CurriculumClassTimetableLesson.findByPk(row.id, { include: lessonInclude });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateTimetableLesson = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId, lessonId } = req.params;
    const { curriculumClass, timetable, error } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    const lesson = await CurriculumClassTimetableLesson.findOne({
      where: { id: lessonId, timetable_id: timetable.id },
    });
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found" });
    }

    const patch = {};
    if (req.body.lesson_date !== undefined) {
      if (!req.body.lesson_date) {
        return res.status(400).json({ success: false, message: "lesson_date cannot be empty" });
      }
      patch.lesson_date = req.body.lesson_date;
    }
    if (req.body.day_of_week !== undefined) {
      if (req.body.day_of_week === null) {
        patch.day_of_week = null;
      } else {
        const d = Number(req.body.day_of_week);
        if (!Number.isInteger(d) || d < 1 || d > 7) {
          return res.status(400).json({ success: false, message: "day_of_week must be 1–7" });
        }
        patch.day_of_week = d;
      }
    }
    if (req.body.period_index !== undefined) {
      if (req.body.period_index === null || req.body.period_index === "") {
        patch.period_index = null;
      } else {
        const p = Number(req.body.period_index);
        if (!Number.isInteger(p) || p < 1) {
          return res.status(400).json({ success: false, message: "period_index must be a positive integer" });
        }
        patch.period_index = p;
      }
    }
    if (req.body.starts_at !== undefined) patch.starts_at = req.body.starts_at || null;
    if (req.body.ends_at !== undefined) patch.ends_at = req.body.ends_at || null;
    if (req.body.timezone !== undefined) {
      patch.timezone =
        req.body.timezone != null && String(req.body.timezone).trim() !== ""
          ? String(req.body.timezone).trim()
          : "Africa/Nairobi";
    }
    if (req.body.room !== undefined) patch.room = req.body.room;
    if (req.body.notes !== undefined) patch.notes = req.body.notes;
    if (req.body.teacher_attended !== undefined) patch.teacher_attended = !!req.body.teacher_attended;
    if (req.body.delivery_mode !== undefined) patch.delivery_mode = normalizeDeliveryMode(req.body.delivery_mode);
    if (req.body.media_mode !== undefined) patch.media_mode = normalizeMediaMode(req.body.media_mode);
    if (patch.delivery_mode === "physical") patch.media_mode = "optional";
    else if (patch.delivery_mode === "online" && req.body.media_mode === undefined && lesson.media_mode == null) {
      patch.media_mode = "optional";
    }

    const overlapDate = patch.lesson_date ?? lesson.lesson_date;
    const overlapStart = patch.starts_at !== undefined ? patch.starts_at : lesson.starts_at;
    const overlapEnd = patch.ends_at !== undefined ? patch.ends_at : lesson.ends_at;

    if (overlapDate && overlapStart && overlapEnd) {
      const ss = timeToSeconds(overlapStart);
      const es = timeToSeconds(overlapEnd);
      if (ss == null || es == null || es <= ss) {
        return res.status(400).json({ success: false, message: "Invalid times: end must be after start" });
      }
    }

    if (patch.lesson_date !== undefined && patch.day_of_week === undefined && lesson.day_of_week != null) {
      const iw = isoWeekdayFromDateOnly(patch.lesson_date);
      if (iw != null) patch.day_of_week = iw;
    }

    if (req.body.curriculum_subject_id !== undefined) {
      const allowed = await subjectAllowedForCurriculumClass(curriculumClass, req.body.curriculum_subject_id);
      if (!allowed.ok) {
        return res.status(400).json({ success: false, message: allowed.message });
      }
      patch.curriculum_subject_id = req.body.curriculum_subject_id;
    }

    const effectiveSubject =
      patch.curriculum_subject_id !== undefined ? patch.curriculum_subject_id : lesson.curriculum_subject_id;

    if (req.body.teacher_id !== undefined) {
      const tid = req.body.teacher_id || null;
      patch.teacher_id = tid;
      if (tid) {
        const tm = await teacherMayTeachLesson({
          teacherId: tid,
          curriculumSubjectId: effectiveSubject,
        });
        if (!tm.ok) {
          return res.status(400).json({ success: false, message: tm.message });
        }
      }
    } else if (lesson.teacher_id && patch.curriculum_subject_id !== undefined) {
      const tm = await teacherMayTeachLesson({
        teacherId: lesson.teacher_id,
        curriculumSubjectId: effectiveSubject,
      });
      if (!tm.ok) {
        return res.status(400).json({ success: false, message: tm.message });
      }
    }

    const effectiveTeacher =
      patch.teacher_id !== undefined ? patch.teacher_id : lesson.teacher_id;

    if (effectiveTeacher && overlapDate && overlapStart && overlapEnd) {
      try {
        await assertNoTeacherOverlap({
          teacherId: effectiveTeacher,
          lessonDate: overlapDate,
          startsAt: overlapStart,
          endsAt: overlapEnd,
          excludeLessonId: lesson.id,
        });
      } catch (e) {
        const code = e.statusCode || 400;
        return res.status(code).json({ success: false, message: e.message });
      }
    }

    await lesson.update(patch);
    const updated = await CurriculumClassTimetableLesson.findByPk(lesson.id, { include: lessonInclude });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getTimetableLessonLiveSession = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await CurriculumClassTimetableLesson.findByPk(lessonId, {
      include: [...dayViewLessonInclude, liveSessionsLatestInclude],
    });
    await assertCanInitiateOnlineLive(req, lesson);
    const latest = lesson.live_sessions?.[0] ?? null;
    return res.json({
      success: true,
      data: {
        lesson,
        live_class: latest,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.initiateTimetableLessonLiveSession = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const forceNew = !!(body.force_new || req.query.force_new === "1");

    const lesson = await CurriculumClassTimetableLesson.findByPk(lessonId, {
      include: dayViewLessonInclude,
    });
    await assertCanInitiateOnlineLive(req, lesson);

    const hostResolved = await resolveLiveHostTeacherId(req, lesson, body);
    if (hostResolved.error) {
      return res.status(400).json({ success: false, message: hostResolved.error });
    }
    const { teacherId } = hostResolved;

    if (!forceNew) {
      const reusable = await LiveClass.findOne({
        where: {
          curriculum_class_timetable_lesson_id: lesson.id,
          session_status: { [Op.in]: ["scheduled", "live"] },
          [Op.or]: [
            { join_url: { [Op.ne]: null } },
            { platform: { [Op.in]: ["webrtc", "livekit"] }, meeting_id: { [Op.ne]: null } },
          ],
        },
        order: [["created_at", "DESC"]],
      });
      const reusableReady =
        reusable &&
        (String(reusable.join_url || "").trim() !== "" ||
          (isInAppVideoPlatform(reusable.platform) && String(reusable.meeting_id || "").trim() !== ""));
      if (reusableReady) {
        if (isInAppVideoPlatform(reusable.platform)) {
          const linkUrls = webrtcRoomService.urlsForLiveClassRow(reusable.id);
          await reusable.update({
            join_url: linkUrls.join_url,
            host_url: linkUrls.host_url,
            session_status: "live",
          });
          await reusable.reload();
        } else if (reusable.session_status === "scheduled") {
          await reusable.update({ session_status: "live" });
          await reusable.reload();
        }
        // Teacher has actively opened/initiated this online lesson session.
        if (!lesson.teacher_attended) {
          await lesson.update({ teacher_attended: true });
        }
        return res.json({
          success: true,
          data: {
            live_class: reusable,
            lesson,
            reused: true,
          },
        });
      }
    }

    const provisionPayload = await tryProvisionMeetingForLesson(lesson);
    const urls = resolveMeetingUrls(body, provisionPayload);
    const isInApp = isInAppVideoPlatform(urls.platform || provisionPayload?.platform);
    if (!isInApp && (!urls.join_url || String(urls.join_url).trim() === "")) {
      return res.status(400).json({
        success: false,
        message:
          "No meeting join URL available. Set ONLINE_MEETING_PLATFORM=livekit, webrtc, or teams (with TEAMS_* env vars), or provide join_url in the request body.",
      });
    }

    const window = lessonWindowDates(lesson) || {
      start_time: new Date(),
      end_time: new Date(Date.now() + 3600000),
    };

    const meetingRef =
      urls.meeting_id && String(urls.meeting_id).trim() !== ""
        ? String(urls.meeting_id).trim()
        : `tt-lesson-${lesson.id}-${crypto.randomUUID()}`;

    const row = await LiveClass.create({
      class_session_id: null,
      curriculum_class_timetable_lesson_id: lesson.id,
      meeting_id: meetingRef,
      platform: urls.platform || provisionPayload?.platform || "other",
      teacher_id: teacherId,
      start_time: window.start_time,
      end_time: window.end_time,
      join_url: isInApp ? "" : urls.join_url,
      host_url: isInApp ? "" : urls.host_url || urls.join_url,
      session_status: "live",
      attendance_count: 0,
    });

    if (isInApp) {
      const linkUrls = webrtcRoomService.urlsForLiveClassRow(row.id);
      await row.update({
        join_url: linkUrls.join_url,
        host_url: linkUrls.host_url,
        session_status: "live",
      });
    }

    // Auto-mark teacher attendance once the teacher successfully initiates the lesson session.
    if (!lesson.teacher_attended) {
      await lesson.update({ teacher_attended: true });
    }

    const live_class = await LiveClass.findByPk(row.id, {
      attributes: [
        "id",
        "meeting_id",
        "join_url",
        "host_url",
        "platform",
        "session_status",
        "start_time",
        "end_time",
        "teacher_id",
        "curriculum_class_timetable_lesson_id",
        "created_at",
      ],
    });
    return res.status(201).json({
      success: true,
      data: {
        live_class,
        lesson,
        reused: false,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

/** System in-app notifications (public portal bell) for students in this lesson's curriculum class — no email. */
exports.notifyOnlineLessonClass = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const noteExtra = body.note != null ? String(body.note).trim().slice(0, 2000) : "";

    const lesson = await CurriculumClassTimetableLesson.findByPk(lessonId, {
      include: [...dayViewLessonInclude],
    });
    await assertCanInitiateOnlineLive(req, lesson);

    const timetable = lesson?.timetable;
    const studentWhere = studentWhereForLessonTimetable(timetable);
    if (!studentWhere) {
      return res.status(400).json({ success: false, message: "Lesson has no curriculum class on timetable." });
    }

    const live = await LiveClass.findOne({
      where: {
        curriculum_class_timetable_lesson_id: lesson.id,
        session_status: { [Op.in]: ["scheduled", "live"] },
        [Op.or]: [
          { join_url: { [Op.ne]: null } },
          { platform: { [Op.in]: ["webrtc", "livekit"] }, meeting_id: { [Op.ne]: null } },
        ],
      },
      order: [["created_at", "DESC"]],
    });
    let joinUrl =
      (live?.join_url && String(live.join_url).trim()) ||
      (body.join_url != null && String(body.join_url).trim()) ||
      "";
    if (!joinUrl && isInAppVideoPlatform(live?.platform) && live?.id) {
      joinUrl = webrtcRoomService.portalLiveClassUrl(live.id);
    }
    if (!joinUrl) {
      return res.status(400).json({
        success: false,
        message: "No join URL yet. Prepare the online lesson first (Initiate), or include join_url in the request body.",
      });
    }

    const subjectName = lesson.curriculum_subject?.name || "Online lesson";
    const lessonDate = lesson.lesson_date ? String(lesson.lesson_date) : "";

    const students = await Student.findAll({
      where: studentWhere,
      attributes: ["id", "user_id"],
    });

    const title = `Online class: ${subjectName}`;
    let message = lessonDate ? `${subjectName} · ${lessonDate}\n\nJoin: ${joinUrl}` : `${subjectName}\n\nJoin: ${joinUrl}`;
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
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.getTimetableLessonLiveTracking = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await CurriculumClassTimetableLesson.findByPk(lessonId, {
      include: [...dayViewLessonInclude],
    });
    await assertCanInitiateOnlineLive(req, lesson);

    const live = await LiveClass.findOne({
      where: { curriculum_class_timetable_lesson_id: lesson.id },
      order: [["created_at", "DESC"]],
      attributes: [
        "id",
        "join_url",
        "host_url",
        "session_status",
        "platform",
        "meeting_id",
        "created_at",
        "attendance_count",
        "start_time",
        "end_time",
      ],
      include: [
        {
          model: LiveClassAttendance,
          as: "live_attendances",
          separate: true,
          order: [["join_time", "DESC"]],
          include: [
            {
              model: Student,
              as: "student",
              attributes: ["id", "admission_number", "user_id"],
              include: [{ model: User, as: "user", ...userSafe }],
            },
          ],
        },
        {
          model: LiveClassRecording,
          as: "recordings",
          separate: true,
          order: [["created_at", "DESC"]],
        },
      ],
    });

    return res.json({
      success: true,
      data: {
        lesson: {
          id: lesson.id,
          lesson_date: lesson.lesson_date,
          delivery_mode: lesson.delivery_mode,
        },
        live_class: live,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.createTimetableLessonLiveRecording = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const recording_url =
      body.recording_url != null && String(body.recording_url).trim() !== ""
        ? String(body.recording_url).trim()
        : "";
    if (!recording_url) {
      return res.status(400).json({ success: false, message: "recording_url is required" });
    }

    const lesson = await CurriculumClassTimetableLesson.findByPk(lessonId, {
      include: [...dayViewLessonInclude],
    });
    await assertCanInitiateOnlineLive(req, lesson);

    const live = await LiveClass.findOne({
      where: { curriculum_class_timetable_lesson_id: lesson.id },
      order: [["created_at", "DESC"]],
    });
    if (!live) {
      return res.status(400).json({
        success: false,
        message: "No live session exists for this lesson yet. Prepare meeting links first.",
      });
    }

    let duration_seconds = 0;
    if (body.duration_seconds != null && body.duration_seconds !== "") {
      const n = parseInt(body.duration_seconds, 10);
      if (Number.isFinite(n) && n >= 0) duration_seconds = n;
    }

    const storage_path =
      body.storage_path != null && String(body.storage_path).trim() !== ""
        ? String(body.storage_path).trim().slice(0, 500)
        : null;

    const row = await LiveClassRecording.create({
      live_class_id: live.id,
      recording_url: recording_url.slice(0, 500),
      duration_seconds,
      storage_path: storage_path ? storage_path.slice(0, 500) : null,
    });

    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.deleteTimetableLesson = async (req, res) => {
  try {
    const { curriculumId, classId, timetableId, lessonId } = req.params;
    const { timetable, error } = await loadTimetableInClass(curriculumId, classId, timetableId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    const lesson = await CurriculumClassTimetableLesson.findOne({
      where: { id: lessonId, timetable_id: timetable.id },
    });
    if (!lesson) {
      return res.status(404).json({ success: false, message: "Lesson not found" });
    }
    await lesson.destroy();
    return res.json({ success: true, message: "Lesson removed" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
