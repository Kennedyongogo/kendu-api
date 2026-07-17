const express = require("express");
const router = express.Router();
const {
  listPublicActive,
  listAllPublic,
  listPublicCurriculumClasses,
  listPublicCurriculumClassLevels,
  listCurricula,
  getCurriculum,
  createCurriculum,
  updateCurriculum,
  deleteCurriculum,
  publicGetCurriculum,
} = require("../controllers/curriculumController");
const {
  listTimetableLessonsByDate,
  listOnlineTimetableLessonsUpcoming,
  listTeachersForCurriculumTimetable,
  listCurriculumClassTimetables,
  createCurriculumClassTimetable,
  getCurriculumClassTimetable,
  updateCurriculumClassTimetable,
  deleteCurriculumClassTimetable,
  createTimetableLesson,
  updateTimetableLesson,
  deleteTimetableLesson,
  getTimetableLessonLiveSession,
  initiateTimetableLessonLiveSession,
  notifyOnlineLessonClass,
  getTimetableLessonLiveTracking,
  createTimetableLessonLiveRecording,
} = require("../controllers/curriculumClassTimetableController");
const {
  getLessonAttendanceRegister,
  saveLessonAttendanceRegister,
  finalizeLessonAttendanceRegister,
  downloadLessonAttendanceRegisterPdf,
} = require("../controllers/lessonAttendanceRegisterController");
const {
  listAllCurriculumClasses,
  listAllCurriculumClassLevels,
  listAllCurriculumSubjects,
  listCurriculumClasses,
  createCurriculumClass,
  getCurriculumClass,
  updateCurriculumClass,
  deleteCurriculumClass,
  listCurriculumClassLevels,
  createCurriculumClassLevel,
  getCurriculumClassLevel,
  updateCurriculumClassLevel,
  deleteCurriculumClassLevel,
  listCurriculumSubjects,
  createCurriculumSubject,
  getCurriculumSubject,
  updateCurriculumSubject,
  deleteCurriculumSubject,
  listCurriculumSubjectTopics,
  createCurriculumSubjectTopic,
  listCurriculumSubjectSubtopics,
  createCurriculumSubjectSubtopic,
  getCurriculumSubjectSubtopic,
  updateCurriculumSubjectSubtopic,
  deleteCurriculumSubjectSubtopic,
  getCurriculumSubjectTopic,
  updateCurriculumSubjectTopic,
  deleteCurriculumSubjectTopic,
} = require("../controllers/curriculumHierarchyController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/public/active", listPublicActive);
router.get("/public/all", listAllPublic);
router.get("/public/:curriculumId/classes", listPublicCurriculumClasses);
router.get("/public/:curriculumId/classes/:classId/levels", listPublicCurriculumClassLevels);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurricula);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculum);

/** Nested curriculum structure — register before `/:curriculumId/classes` */
router.get("/all-classes", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listAllCurriculumClasses);
router.get("/all-class-levels", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listAllCurriculumClassLevels);
router.get("/all-subjects", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listAllCurriculumSubjects);

router.get(
  "/timetable-lessons/by-date",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  listTimetableLessonsByDate
);
router.get(
  "/timetable-lessons/online-upcoming",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  listOnlineTimetableLessonsUpcoming
);
router.get(
  "/timetable-lessons/:lessonId/live-session",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  getTimetableLessonLiveSession
);
router.post(
  "/timetable-lessons/:lessonId/live-session/initiate",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  initiateTimetableLessonLiveSession
);
router.post(
  "/timetable-lessons/:lessonId/notify-class",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  notifyOnlineLessonClass
);
router.get(
  "/timetable-lessons/:lessonId/live-tracking",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  getTimetableLessonLiveTracking
);
router.post(
  "/timetable-lessons/:lessonId/live-recording",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  createTimetableLessonLiveRecording
);
router.get(
  "/timetable-lessons/:lessonId/attendance-register/pdf",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  downloadLessonAttendanceRegisterPdf
);
router.get(
  "/timetable-lessons/:lessonId/attendance-register",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  getLessonAttendanceRegister
);
router.put(
  "/timetable-lessons/:lessonId/attendance-register",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  saveLessonAttendanceRegister
);
router.post(
  "/timetable-lessons/:lessonId/attendance-register/finalize",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  finalizeLessonAttendanceRegister
);

router.get(
  "/:curriculumId/teachers-for-timetable",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  listTeachersForCurriculumTimetable
);

router.get("/:curriculumId/classes", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurriculumClasses);
router.post("/:curriculumId/classes", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculumClass);
router.get("/:curriculumId/classes/:classId", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculumClass);
router.put("/:curriculumId/classes/:classId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculumClass);
router.delete("/:curriculumId/classes/:classId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculumClass);

router.get("/:curriculumId/classes/:classId/timetables", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurriculumClassTimetables);
router.post("/:curriculumId/classes/:classId/timetables", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculumClassTimetable);
router.get("/:curriculumId/classes/:classId/timetables/:timetableId", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculumClassTimetable);
router.put("/:curriculumId/classes/:classId/timetables/:timetableId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculumClassTimetable);
router.delete("/:curriculumId/classes/:classId/timetables/:timetableId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculumClassTimetable);

router.post(
  "/:curriculumId/classes/:classId/timetables/:timetableId/lessons",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  createTimetableLesson
);
router.put(
  "/:curriculumId/classes/:classId/timetables/:timetableId/lessons/:lessonId",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  updateTimetableLesson
);
router.delete(
  "/:curriculumId/classes/:classId/timetables/:timetableId/lessons/:lessonId",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  deleteTimetableLesson
);

router.get("/:curriculumId/classes/:classId/levels", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurriculumClassLevels);
router.post("/:curriculumId/classes/:classId/levels", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculumClassLevel);
router.get("/:curriculumId/classes/:classId/levels/:levelId", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculumClassLevel);
router.put("/:curriculumId/classes/:classId/levels/:levelId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculumClassLevel);
router.delete("/:curriculumId/classes/:classId/levels/:levelId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculumClassLevel);

router.get("/:curriculumId/subjects", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurriculumSubjects);
router.post("/:curriculumId/subjects", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculumSubject);
router.get("/:curriculumId/subjects/:subjectId", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculumSubject);
router.put("/:curriculumId/subjects/:subjectId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculumSubject);
router.delete("/:curriculumId/subjects/:subjectId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculumSubject);

router.get("/:curriculumId/subjects/:subjectId/topics", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listCurriculumSubjectTopics);
router.post("/:curriculumId/subjects/:subjectId/topics", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createCurriculumSubjectTopic);
router.get(
  "/:curriculumId/subjects/:subjectId/topics/:topicId/subtopics",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  listCurriculumSubjectSubtopics
);
router.post(
  "/:curriculumId/subjects/:subjectId/topics/:topicId/subtopics",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  createCurriculumSubjectSubtopic
);
router.get(
  "/:curriculumId/subjects/:subjectId/topics/:topicId/subtopics/:subtopicId",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  getCurriculumSubjectSubtopic
);
router.put(
  "/:curriculumId/subjects/:subjectId/topics/:topicId/subtopics/:subtopicId",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  updateCurriculumSubjectSubtopic
);
router.delete(
  "/:curriculumId/subjects/:subjectId/topics/:topicId/subtopics/:subtopicId",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  deleteCurriculumSubjectSubtopic
);
router.get("/:curriculumId/subjects/:subjectId/topics/:topicId", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculumSubjectTopic);
router.put("/:curriculumId/subjects/:subjectId/topics/:topicId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculumSubjectTopic);
router.delete("/:curriculumId/subjects/:subjectId/topics/:topicId", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculumSubjectTopic);

router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getCurriculum);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateCurriculum);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteCurriculum);

router.use(errorHandler);

module.exports = router;
