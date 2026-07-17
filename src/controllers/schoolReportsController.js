const { Op } = require("sequelize");
const {
  CurriculumClassTimetableLesson,
  CurriculumClassTimetable,
  CurriculumClass,
  CurriculumClassLevel,
  Curriculum,
  CurriculumSubject,
  Exam,
  Teacher,
  User,
  LiveClassAttendance,
  LiveClass,
  Student,
  ExamAttempt,
  ExamSubmission,
} = require("../models");
const { isTeacherAttendedForHr } = require("../utils/examProctoring");

function parseHrAttendanceQuery(req) {
  const dateRaw = req.query.date != null ? String(req.query.date).trim() : "";
  const scopeRaw = req.query.scope != null ? String(req.query.scope).trim().toLowerCase() : "lessons";
  const scope = scopeRaw === "exams" ? "exams" : "lessons";
  const hasDateFilter = dateRaw !== "";
  const curriculumId =
    req.query.curriculum_id != null ? String(req.query.curriculum_id).trim() : "";
  const curriculumClassId =
    req.query.curriculum_class_id != null ? String(req.query.curriculum_class_id).trim() : "";
  const search = req.query.search != null ? String(req.query.search).trim() : "";
  const audienceRaw = req.query.audience != null ? String(req.query.audience).trim().toLowerCase() : "all";
  const audience = audienceRaw === "teachers" || audienceRaw === "students" ? audienceRaw : "all";

  if (hasDateFilter && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { error: "date must be YYYY-MM-DD" };
  }

  return {
    dateRaw,
    scope,
    hasDateFilter,
    curriculumId,
    curriculumClassId,
    hasCurriculumFilter: Boolean(curriculumId || curriculumClassId),
    search,
    hasSearch: Boolean(search),
    audience,
    includeTeachers: audience !== "students",
    includeStudents: audience !== "teachers",
  };
}

function userNameWhere(search) {
  const term = `%${search}%`;
  return {
    [Op.or]: [
      { full_name: { [Op.iLike]: term } },
      { username: { [Op.iLike]: term } },
    ],
  };
}

function teacherInclude() {
  return {
    model: Teacher,
    as: "teacher",
    required: false,
    attributes: ["id"],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "full_name", "username"],
      },
    ],
  };
}

function studentInclude() {
  return {
    model: Student,
    as: "student",
    attributes: ["id", "admission_number"],
    include: [{ model: User, as: "user", attributes: ["id", "full_name", "username"] }],
  };
}

async function findTeacherIdsForSearch(search) {
  const rows = await Teacher.findAll({
    attributes: ["id"],
    include: [
      {
        model: User,
        as: "user",
        required: true,
        attributes: [],
        where: userNameWhere(search),
      },
    ],
  });
  return rows.map((row) => row.id);
}

async function findStudentIdsForSearch(search) {
  const term = `%${search}%`;
  const [byAdmission, byUser] = await Promise.all([
    Student.findAll({
      where: { admission_number: { [Op.iLike]: term } },
      attributes: ["id"],
    }),
    Student.findAll({
      attributes: ["id"],
      include: [
        {
          model: User,
          as: "user",
          required: true,
          attributes: [],
          where: userNameWhere(search),
        },
      ],
    }),
  ]);
  return [...new Set([...byAdmission.map((row) => row.id), ...byUser.map((row) => row.id)])];
}

function buildExamWhere({ dateRaw, hasDateFilter, curriculumId, curriculumClassId }) {
  const examWhere = hasDateFilter
    ? {
        start_time: {
          [Op.between]: [new Date(`${dateRaw}T00:00:00.000Z`), new Date(`${dateRaw}T23:59:59.999Z`)],
        },
      }
    : { start_time: { [Op.ne]: null } };

  if (curriculumId) examWhere.curriculum_id = curriculumId;
  if (curriculumClassId) examWhere.curriculum_class_id = curriculumClassId;

  return examWhere;
}

function buildCurriculumClassWhere(curriculumId, curriculumClassId) {
  const where = {};
  if (curriculumClassId) where.id = curriculumClassId;
  if (curriculumId) where.curriculum_id = curriculumId;
  return where;
}

function curriculumClassInclude(curriculumId, curriculumClassId) {
  const where = buildCurriculumClassWhere(curriculumId, curriculumClassId);
  const hasFilter = Boolean(curriculumId || curriculumClassId);
  return {
    model: CurriculumClass,
    as: "curriculum_class",
    attributes: ["id", "name", "code"],
    required: hasFilter,
    where: Object.keys(where).length ? where : undefined,
    include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name"] }],
  };
}

exports.getHrAttendanceOverview = async (req, res) => {
  try {
    const parsed = parseHrAttendanceQuery(req);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const {
      dateRaw,
      scope,
      hasDateFilter,
      curriculumId,
      curriculumClassId,
      hasCurriculumFilter,
      search,
      hasSearch,
      audience,
      includeTeachers,
      includeStudents,
    } = parsed;

    let teacherIdsForSearch = null;
    let studentIdsForSearch = null;
    if (hasSearch) {
      const lookups = [];
      if (includeTeachers) lookups.push(findTeacherIdsForSearch(search));
      else lookups.push(Promise.resolve([]));
      if (includeStudents) lookups.push(findStudentIdsForSearch(search));
      else lookups.push(Promise.resolve([]));
      [teacherIdsForSearch, studentIdsForSearch] = await Promise.all(lookups);
    }

    if (scope === "exams") {
      const examWhere = buildExamWhere({
        dateRaw,
        hasDateFilter,
        curriculumId,
        curriculumClassId,
      });

      if (hasSearch && !teacherIdsForSearch.length && !studentIdsForSearch.length) {
        return res.json({
          success: true,
          data: {
            scope,
            audience,
            date: hasDateFilter ? dateRaw : null,
            date_filtered: hasDateFilter,
            curriculum_id: curriculumId || null,
            curriculum_class_id: curriculumClassId || null,
            search: search || null,
            teacher_attendance: [],
            student_attendance: [],
            extra_submissions: 0,
          },
        });
      }

      const teacherRows =
        !includeTeachers || (hasSearch && !teacherIdsForSearch.length)
          ? []
          : await Exam.findAll({
              where: (() => {
                const teacherExamWhere = { ...examWhere };
                if (hasSearch && teacherIdsForSearch.length) {
                  teacherExamWhere.teacher_id = { [Op.in]: teacherIdsForSearch };
                } else if (hasSearch) {
                  teacherExamWhere.teacher_id = null;
                }
                return teacherExamWhere;
              })(),
              include: [
                { model: Curriculum, as: "curriculum", attributes: ["id", "name"] },
                { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
                { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name"] },
                teacherInclude(),
              ],
              order: [["start_time", "DESC"]],
            });

      const attemptWhere = {};
      if (hasSearch) {
        if (!studentIdsForSearch.length) {
          return res.json({
            success: true,
            data: {
              scope,
              audience,
              date: hasDateFilter ? dateRaw : null,
              date_filtered: hasDateFilter,
              curriculum_id: curriculumId || null,
              curriculum_class_id: curriculumClassId || null,
              search: search || null,
              teacher_attendance: teacherRows.map((r) => ({
                exam_id: r.id,
                exam_schedule_id: r.id,
                exam: { id: r.id, title: r.title },
                curriculum: r.curriculum || null,
                curriculum_class: r.curriculum_class || null,
                curriculum_class_level: r.curriculum_class_level || null,
                teacher: r.teacher || null,
                starts_at: r.start_time,
                ends_at: r.end_time,
                delivery_mode: "online",
                teacher_attended: isTeacherAttendedForHr(r),
                proctoring_mode: r.proctoring_mode,
              })),
              student_attendance: [],
              extra_submissions: 0,
            },
          });
        }
        attemptWhere.student_id = { [Op.in]: studentIdsForSearch };
      }

      const attempts =
        !includeStudents || (hasSearch && !studentIdsForSearch.length)
          ? []
          : await ExamAttempt.findAll({
        where: Object.keys(attemptWhere).length ? attemptWhere : undefined,
        include: [
          {
            model: Exam,
            as: "exam",
            required: true,
            where: examWhere,
            include: [curriculumClassInclude(curriculumId, curriculumClassId)],
          },
          studentInclude(),
        ],
        order: [["created_at", "DESC"]],
      });

      const submissions =
        !includeStudents
          ? []
          : await ExamSubmission.findAll({
        where: hasDateFilter
          ? {
              created_at: {
                [Op.between]: [new Date(`${dateRaw}T00:00:00.000Z`), new Date(`${dateRaw}T23:59:59.999Z`)],
              },
            }
          : {},
        include: hasCurriculumFilter
          ? [
              {
                model: Exam,
                as: "exam",
                required: true,
                where: buildExamWhere({
                  dateRaw: "",
                  hasDateFilter: false,
                  curriculumId,
                  curriculumClassId,
                }),
                attributes: ["id"],
              },
            ]
          : [],
        order: [["created_at", "DESC"]],
      });

      return res.json({
        success: true,
        data: {
          scope,
          audience,
          date: hasDateFilter ? dateRaw : null,
          date_filtered: hasDateFilter,
          curriculum_id: curriculumId || null,
          curriculum_class_id: curriculumClassId || null,
          search: search || null,
          teacher_attendance: teacherRows.map((r) => ({
            exam_id: r.id,
            exam_schedule_id: r.id,
            exam: { id: r.id, title: r.title },
            curriculum: r.curriculum || null,
            curriculum_class: r.curriculum_class || null,
            curriculum_class_level: r.curriculum_class_level || null,
            teacher: r.teacher || null,
            starts_at: r.start_time,
            ends_at: r.end_time,
            delivery_mode: "online",
            teacher_attended: isTeacherAttendedForHr(r),
            proctoring_mode: r.proctoring_mode,
          })),
          student_attendance: attempts.map((a) => ({
            attendance_id: a.id,
            student: a.student || null,
            join_time: a.start_time,
            leave_time: a.end_time,
            duration_minutes: a.time_spent_seconds != null ? Math.round(Number(a.time_spent_seconds) / 60) : null,
            status: a.start_time || a.status === "completed" ? "Attended" : "Pending",
            lesson: null,
            exam: a.exam || null,
            exam_schedule: a.exam || null,
          })),
          extra_submissions: submissions.length,
        },
      });
    }

    const classInclude = curriculumClassInclude(curriculumId, curriculumClassId);

    if (hasSearch && !teacherIdsForSearch.length && !studentIdsForSearch.length) {
      return res.json({
        success: true,
        data: {
          scope,
          audience,
          date: hasDateFilter ? dateRaw : null,
          date_filtered: hasDateFilter,
          curriculum_id: curriculumId || null,
          curriculum_class_id: curriculumClassId || null,
          search: search || null,
          teacher_attendance: [],
          student_attendance: [],
        },
      });
    }

    const lessonWhere = {};
    if (hasDateFilter) lessonWhere.lesson_date = dateRaw;
    if (hasSearch && teacherIdsForSearch.length) {
      lessonWhere.teacher_id = { [Op.in]: teacherIdsForSearch };
    }

    const teacherRows =
      !includeTeachers || (hasSearch && !teacherIdsForSearch.length)
        ? []
        : await CurriculumClassTimetableLesson.findAll({
            where: lessonWhere,
            include: [
              {
                model: CurriculumClassTimetable,
                as: "timetable",
                attributes: ["id", "name"],
                required: hasCurriculumFilter,
                include: [classInclude],
              },
              { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
              teacherInclude(),
            ],
            order: [
              ["lesson_date", "DESC"],
              ["starts_at", "ASC"],
            ],
          });

    const attendanceWhere = {};
    if (hasSearch && studentIdsForSearch.length) {
      attendanceWhere.student_id = { [Op.in]: studentIdsForSearch };
    }

    const studentRows =
      !includeStudents || (hasSearch && !studentIdsForSearch.length)
        ? []
        : await LiveClassAttendance.findAll({
            where: Object.keys(attendanceWhere).length ? attendanceWhere : undefined,
            include: [
              {
                model: LiveClass,
                as: "live_class",
                attributes: ["id"],
                required: true,
                include: [
                  {
                    model: CurriculumClassTimetableLesson,
                    as: "timetable_lesson",
                    required: true,
                    where: hasDateFilter ? { lesson_date: dateRaw } : undefined,
                    attributes: ["id", "lesson_date", "starts_at", "ends_at", "delivery_mode"],
                    include: [
                      { model: CurriculumSubject, as: "curriculum_subject", attributes: ["id", "name"] },
                      {
                        model: CurriculumClassTimetable,
                        as: "timetable",
                        attributes: ["id", "name"],
                        required: hasCurriculumFilter,
                        include: [classInclude],
                      },
                    ],
                  },
                ],
              },
              studentInclude(),
            ],
            order: [["created_at", "DESC"]],
          });

    return res.json({
      success: true,
      data: {
        scope,
        audience,
        date: hasDateFilter ? dateRaw : null,
        date_filtered: hasDateFilter,
        curriculum_id: curriculumId || null,
        curriculum_class_id: curriculumClassId || null,
        search: search || null,
        teacher_attendance: teacherRows.map((r) => ({
          lesson_id: r.id,
          lesson_date: r.lesson_date,
          curriculum: r.timetable?.curriculum_class?.curriculum || null,
          curriculum_class: r.timetable?.curriculum_class || null,
          subject: r.curriculum_subject || null,
          teacher: r.teacher || null,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          delivery_mode: r.delivery_mode,
          teacher_attended: !!r.teacher_attended,
        })),
        student_attendance: studentRows.map((a) => ({
          attendance_id: a.id,
          student: a.student || null,
          join_time: a.join_time,
          leave_time: a.leave_time,
          duration_minutes: a.duration_minutes,
          status: a.join_time ? "Attended" : "Pending",
          lesson: a.live_class?.timetable_lesson || null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
