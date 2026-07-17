const { Op } = require("sequelize");
const {
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumClassTimetable,
  CurriculumClassTimetableLesson,
  CurriculumSubject,
  Teacher,
  User,
  Student,
  LiveClass,
  LiveClassAttendance,
  LessonAttendanceRegister,
  LessonAttendanceRegisterEntry,
  sequelize,
} = require("../models");
const { STAFF_ROLES } = require("../constants/userRoles");
const { MARK_STATUSES } = require("../models/lessonAttendanceRegisterEntry");
const { studentWhereForLessonTimetable } = require("../utils/lessonTermRoster");

const userSafe = { attributes: { exclude: ["password_hash"] } };

const lessonRegisterInclude = [
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
  { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    attributes: ["id"],
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

const registerDetailInclude = [
  {
    model: CurriculumClassTimetableLesson,
    as: "lesson",
    attributes: ["id", "lesson_date", "starts_at", "ends_at", "delivery_mode"],
    include: [
      { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
      {
        model: CurriculumClassTimetable,
        as: "timetable",
        attributes: ["id", "name"],
        include: [{ model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] }],
      },
    ],
  },
  { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
  { model: LiveClass, as: "live_class", attributes: ["id", "session_status", "platform"] },
  { model: User, as: "host", ...userSafe },
  { model: User, as: "finalized_by", ...userSafe },
  {
    model: LessonAttendanceRegisterEntry,
    as: "entries",
    separate: true,
    include: [
      {
        model: Student,
        as: "student",
        attributes: ["id", "admission_number", "user_id"],
        include: [{ model: User, as: "user", ...userSafe }],
      },
      { model: User, as: "marked_by", ...userSafe },
    ],
  },
];

async function teacherProfileFromReq(req) {
  return Teacher.findOne({ where: { user_id: req.user.id } });
}

async function assertCanManageLessonAttendance(req, lesson) {
  if (!lesson) {
    const err = new Error("Timetable lesson not found");
    err.statusCode = 404;
    throw err;
  }
  if (STAFF_ROLES.includes(req.user.role)) return;
  const tp = await teacherProfileFromReq(req);
  if (!tp) {
    const err = new Error("Teacher profile required");
    err.statusCode = 403;
    throw err;
  }
  if (lesson.teacher_id && lesson.teacher_id === tp.id) return;
  const err = new Error("You can only manage attendance for your own lessons");
  err.statusCode = 403;
  throw err;
}

async function loadLessonForRegister(lessonId) {
  return CurriculumClassTimetableLesson.findByPk(lessonId, { include: lessonRegisterInclude });
}

async function portalJoinedStudentIds(lessonId, liveClassId) {
  let targetLiveClassId = liveClassId ? String(liveClassId).trim() : null;

  if (!targetLiveClassId) {
    const [rows] = await sequelize.query(
      `
      SELECT id FROM live_classes
      WHERE curriculum_class_timetable_lesson_id = :lessonId
      ORDER BY start_time DESC NULLS LAST, id DESC
      LIMIT 1
    `,
      { replacements: { lessonId } }
    );
    targetLiveClassId = rows?.[0]?.id || null;
  }

  if (!targetLiveClassId) return new Set();

  const attendances = await LiveClassAttendance.findAll({
    where: { live_class_id: targetLiveClassId },
    attributes: ["student_id"],
  });
  return new Set(attendances.map((a) => a.student_id).filter(Boolean));
}

function normalizeMarksInput(body) {
  const raw = body?.marks;
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [studentId, status] of Object.entries(raw)) {
    if (!studentId) continue;
    if (status == null || status === "") continue;
    const s = String(status).trim().toLowerCase();
    if (!MARK_STATUSES.includes(s)) continue;
    out[String(studentId)] = s;
  }
  return out;
}

function hostDisplayName(user) {
  if (!user) return null;
  return user.full_name || user.username || user.email || null;
}

function formatRegisterResponse(register) {
  const lesson = register.lesson;
  const cc = register.curriculum_class || lesson?.timetable?.curriculum_class;
  const entries = (register.entries || [])
    .map((e) => ({
    id: e.id,
    student_id: e.student_id,
    status: e.status,
    remarks: e.remarks,
    portal_joined: !!e.portal_joined,
    marked_at: e.marked_at,
    student: e.student
      ? {
          id: e.student.id,
          admission_number: e.student.admission_number,
          user: e.student.user
            ? {
                id: e.student.user.id,
                full_name: e.student.user.full_name,
                username: e.student.user.username,
                email: e.student.user.email,
              }
            : null,
        }
      : null,
  }))
    .sort((a, b) => {
      const na = a.student?.user?.full_name || a.student?.admission_number || "";
      const nb = b.student?.user?.full_name || b.student?.admission_number || "";
      return String(na).localeCompare(String(nb));
    });

  return {
    id: register.id,
    status: register.status,
    notes: register.notes,
    lesson_id: register.curriculum_class_timetable_lesson_id,
    curriculum_class_id: register.curriculum_class_id,
    live_class_id: register.live_class_id,
    hosted_by_user_id: register.hosted_by_user_id,
    host_name: hostDisplayName(register.host),
    finalized_at: register.finalized_at,
    finalized_by_user_id: register.finalized_by_user_id,
    finalized_by_name: hostDisplayName(register.finalized_by),
    updated_at: register.updated_at,
    lesson: lesson
      ? {
          id: lesson.id,
          lesson_date: lesson.lesson_date,
          starts_at: lesson.starts_at,
          ends_at: lesson.ends_at,
          delivery_mode: lesson.delivery_mode,
          subject: lesson.curriculum_subject || null,
        }
      : null,
    curriculum_class: cc
      ? {
          id: cc.id,
          name: cc.name,
          code: cc.code,
          label: `${cc.name || ""}${cc.code ? ` (${cc.code})` : ""}`.trim(),
        }
      : null,
    entries,
    marks: Object.fromEntries(entries.filter((e) => e.status).map((e) => [e.student_id, e.status])),
  };
}

async function ensureRegisterRows(register, lesson, portalIds) {
  const studentWhere = studentWhereForLessonTimetable(lesson?.timetable);
  if (!studentWhere) {
    const err = new Error("Lesson is not linked to a curriculum class");
    err.statusCode = 400;
    throw err;
  }
  const students = await Student.findAll({
    where: studentWhere,
    attributes: ["id"],
    order: [["admission_number", "ASC"]],
  });
  const existing = await LessonAttendanceRegisterEntry.findAll({
    where: { register_id: register.id },
    attributes: ["id", "student_id"],
  });
  const have = new Set(existing.map((e) => e.student_id));
  const toCreate = students
    .filter((s) => !have.has(s.id))
    .map((s) => ({
      register_id: register.id,
      student_id: s.id,
      portal_joined: portalIds.has(s.id),
    }));
  if (toCreate.length) {
    await LessonAttendanceRegisterEntry.bulkCreate(toCreate);
  }
  if (portalIds.size) {
    await LessonAttendanceRegisterEntry.update(
      { portal_joined: true },
      { where: { register_id: register.id, student_id: { [Op.in]: [...portalIds] } } }
    );
  }
}

async function getOrCreateRegister(lesson, req, liveClassId) {
  const classId = lesson.timetable?.curriculum_class_id;
  if (!classId) {
    const err = new Error("Lesson is not linked to a curriculum class");
    err.statusCode = 400;
    throw err;
  }

  const portalIds = await portalJoinedStudentIds(lesson.id, liveClassId);
  let register = await LessonAttendanceRegister.findOne({
    where: { curriculum_class_timetable_lesson_id: lesson.id },
  });

  if (!register) {
    register = await LessonAttendanceRegister.create({
      curriculum_class_timetable_lesson_id: lesson.id,
      curriculum_class_id: classId,
      live_class_id: liveClassId || null,
      hosted_by_user_id: req.user.id,
      status: "draft",
    });
  } else if (liveClassId && !register.live_class_id) {
    await register.update({ live_class_id: liveClassId });
  }

  if (!register.hosted_by_user_id) {
    await register.update({ hosted_by_user_id: req.user.id });
  }

  await ensureRegisterRows(register, lesson, portalIds);
  return register.reload({ include: registerDetailInclude });
}

exports.getLessonAttendanceRegister = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await loadLessonForRegister(lessonId);
    await assertCanManageLessonAttendance(req, lesson);

    const liveClassId = req.query.live_class_id ? String(req.query.live_class_id).trim() : null;
    const register = await getOrCreateRegister(lesson, req, liveClassId);

    return res.json({ success: true, data: formatRegisterResponse(register) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.saveLessonAttendanceRegister = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lesson = await loadLessonForRegister(lessonId);
    await assertCanManageLessonAttendance(req, lesson);

    const liveClassId = body.live_class_id != null ? String(body.live_class_id).trim() : null;
    let register = await getOrCreateRegister(lesson, req, liveClassId || undefined);

    if (register.status === "finalized" && !STAFF_ROLES.includes(req.user.role)) {
      return res.status(400).json({ success: false, message: "This attendance register is finalized and cannot be edited." });
    }

    const marks = normalizeMarksInput(body);
    const now = new Date();

    await sequelize.transaction(async (t) => {
      if (body.notes !== undefined) {
        const notes = body.notes == null ? null : String(body.notes).slice(0, 2000);
        await register.update({ notes }, { transaction: t });
      }
      if (liveClassId) {
        await register.update({ live_class_id: liveClassId }, { transaction: t });
      }

      for (const [studentId, status] of Object.entries(marks)) {
        const [entry] = await LessonAttendanceRegisterEntry.findOrCreate({
          where: { register_id: register.id, student_id: studentId },
          defaults: {
            register_id: register.id,
            student_id: studentId,
            portal_joined: false,
          },
          transaction: t,
        });
        await entry.update(
          {
            status,
            marked_by_user_id: req.user.id,
            marked_at: now,
          },
          { transaction: t }
        );
      }
    });

    register = await LessonAttendanceRegister.findByPk(register.id, { include: registerDetailInclude });
    return res.json({
      success: true,
      data: formatRegisterResponse(register),
      message: "Attendance register saved.",
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.finalizeLessonAttendanceRegister = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await loadLessonForRegister(lessonId);
    await assertCanManageLessonAttendance(req, lesson);

    const register = await LessonAttendanceRegister.findOne({
      where: { curriculum_class_timetable_lesson_id: lesson.id },
      include: registerDetailInclude,
    });
    if (!register) {
      return res.status(404).json({ success: false, message: "No attendance register found for this lesson." });
    }
    if (register.status === "finalized") {
      return res.json({ success: true, data: formatRegisterResponse(register), message: "Already finalized." });
    }

    const now = new Date();
    await register.update({
      status: "finalized",
      finalized_at: now,
      finalized_by_user_id: req.user.id,
    });
    await register.reload({ include: registerDetailInclude });

    return res.json({
      success: true,
      data: formatRegisterResponse(register),
      message: "Attendance register finalized.",
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.downloadLessonAttendanceRegisterPdf = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const lesson = await loadLessonForRegister(lessonId);
    await assertCanManageLessonAttendance(req, lesson);

    const liveClassId = req.query.live_class_id ? String(req.query.live_class_id).trim() : null;
    const register = await getOrCreateRegister(lesson, req, liveClassId);
    const payload = formatRegisterResponse(register);
    const pdf = await buildLessonAttendanceRegisterPdf(payload);
    const filename = attendanceRegisterPdfFilename(payload);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
