const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const {
  listSchoolPortalNotifications,
  markSchoolPortalNotificationRead,
  markAllSchoolPortalNotificationsRead,
} = require("../controllers/schoolPortalNotificationController");
const {
  recordLiveSessionJoin,
  recordLiveSessionLeave,
} = require("../controllers/schoolPortalLiveSessionController");
const { getLiveClassRoom } = require("../controllers/schoolPortalLiveClassController");
const { issueLiveKitToken } = require("../controllers/livekitTokenController");
const { reportLiveKitConnectionError } = require("../controllers/livekitConnectionErrorController");
const {
  getLiveClassInteractions,
  postLiveClassChat,
  markLiveClassQuestionAnswered,
  raiseHand,
  lowerHand,
  dismissHand,
  postLiveClassReaction,
} = require("../controllers/liveClassInteractionController");
const {
  getLiveClassWhiteboard,
  postLiveClassWhiteboardStroke,
  clearLiveClassWhiteboard,
} = require("../controllers/liveClassWhiteboardController");
const {
  getLiveClassLobby,
  getMyLobbyStatus,
  requestLobbyJoin,
  admitLobbyEntry,
  denyLobbyEntry,
  admitAllLobby,
  leaveLobby,
} = require("../controllers/liveClassLobbyController");
const {
  listMyStudentTimetableLessons,
  listMyStudentExamSchedules,
  getMyStudentExamResult,
  streamMyStudentExamResultPdf,
  streamMyStudentExamAnsweredPdf,
} = require("../controllers/schoolPortalTimetableController");
const {
  listMyStudentReportCards,
  getMyStudentReportCard,
  streamMyStudentReportCardPdf,
} = require("../controllers/reportCardController");
const { getExamLiveRoom, getExamScheduleLiveRoom } = require("../controllers/examScheduleLiveController");
const { issueExamScheduleLiveKitToken } = require("../controllers/examScheduleLivekitTokenController");
const {
  getExamScheduleLobby,
  getMyExamScheduleLobbyStatus,
  requestExamScheduleLobbyJoin,
  leaveExamScheduleLobby,
  admitExamScheduleLobbyEntry,
  denyExamScheduleLobbyEntry,
  admitAllExamScheduleLobby,
} = require("../controllers/examScheduleLobbyController");
const { authorizeRoles } = require("../middleware/auth");
const requireStudentPortalUnlocked = require("../middleware/requireStudentPortalUnlocked");

const studentPortalContent = [
  authenticateUser,
  authorizeRoles(["student"]),
  requireStudentPortalUnlocked,
];

router.get("/notifications", authenticateUser, listSchoolPortalNotifications);
router.patch("/notifications/:id/read", authenticateUser, markSchoolPortalNotificationRead);
router.post("/notifications/mark-all-read", authenticateUser, markAllSchoolPortalNotificationsRead);

router.post("/live-session/join", ...studentPortalContent, recordLiveSessionJoin);
router.post("/live-session/leave", ...studentPortalContent, recordLiveSessionLeave);
router.post("/livekit/connection-error", authenticateUser, reportLiveKitConnectionError);
router.get("/live-class/:id", authenticateUser, getLiveClassRoom);
router.post("/live-class/:id/livekit-token", authenticateUser, issueLiveKitToken);
router.get("/live-class/:id/interactions", authenticateUser, getLiveClassInteractions);
router.post("/live-class/:id/chat", authenticateUser, postLiveClassChat);
router.patch("/live-class/:id/chat/:messageId/answered", authenticateUser, markLiveClassQuestionAnswered);
router.post("/live-class/:id/hand/raise", authenticateUser, raiseHand);
router.post("/live-class/:id/hand/lower", authenticateUser, lowerHand);
router.post("/live-class/:id/hand/:handId/dismiss", authenticateUser, dismissHand);
router.post("/live-class/:id/reaction", authenticateUser, postLiveClassReaction);
router.get("/live-class/:id/whiteboard", authenticateUser, getLiveClassWhiteboard);
router.post("/live-class/:id/whiteboard/strokes", authenticateUser, postLiveClassWhiteboardStroke);
router.delete("/live-class/:id/whiteboard", authenticateUser, clearLiveClassWhiteboard);
router.get("/live-class/:id/lobby", authenticateUser, getLiveClassLobby);
router.get("/live-class/:id/lobby/me", authenticateUser, getMyLobbyStatus);
router.post("/live-class/:id/lobby/join", authenticateUser, requestLobbyJoin);
router.post("/live-class/:id/lobby/leave", authenticateUser, leaveLobby);
router.post("/live-class/:id/lobby/:entryId/admit", authenticateUser, admitLobbyEntry);
router.post("/live-class/:id/lobby/:entryId/deny", authenticateUser, denyLobbyEntry);
router.post("/live-class/:id/lobby/admit-all", authenticateUser, admitAllLobby);
router.get("/student/timetable-lessons", ...studentPortalContent, listMyStudentTimetableLessons);
router.get("/student/exams", ...studentPortalContent, listMyStudentExamSchedules);
router.get("/student/exam-schedules", ...studentPortalContent, listMyStudentExamSchedules);
router.get("/student/exam-results/:examScheduleId", ...studentPortalContent, getMyStudentExamResult);
router.get("/student/exam-results/exam/:examId", ...studentPortalContent, getMyStudentExamResult);
router.get("/student/exam-results/:examScheduleId/pdf", ...studentPortalContent, streamMyStudentExamResultPdf);
router.get("/student/exam-results/exam/:examId/pdf", ...studentPortalContent, streamMyStudentExamResultPdf);
router.get("/student/exam-results/:examScheduleId/answered-pdf", ...studentPortalContent, streamMyStudentExamAnsweredPdf);
router.get("/student/exam-results/exam/:examId/answered-pdf", ...studentPortalContent, streamMyStudentExamAnsweredPdf);
router.get("/student/report-cards", ...studentPortalContent, listMyStudentReportCards);
router.get("/student/report-cards/:id/pdf", ...studentPortalContent, streamMyStudentReportCardPdf);
router.get("/student/report-cards/:id", ...studentPortalContent, getMyStudentReportCard);
router.get("/exam/:id", authenticateUser, getExamLiveRoom);
router.post("/exam/:id/livekit-token", authenticateUser, issueExamScheduleLiveKitToken);
router.get("/exam/:id/lobby", authenticateUser, getExamScheduleLobby);
router.get("/exam/:id/lobby/me", authenticateUser, getMyExamScheduleLobbyStatus);
router.post("/exam/:id/lobby/join", authenticateUser, requestExamScheduleLobbyJoin);
router.post("/exam/:id/lobby/leave", authenticateUser, leaveExamScheduleLobby);
router.post("/exam/:id/lobby/:entryId/admit", authenticateUser, admitExamScheduleLobbyEntry);
router.post("/exam/:id/lobby/:entryId/deny", authenticateUser, denyExamScheduleLobbyEntry);
router.post("/exam/:id/lobby/admit-all", authenticateUser, admitAllExamScheduleLobby);
router.get("/exam-schedule/:id", authenticateUser, getExamScheduleLiveRoom);
router.post("/exam-schedule/:id/livekit-token", authenticateUser, issueExamScheduleLiveKitToken);
router.get("/exam-schedule/:id/lobby", authenticateUser, getExamScheduleLobby);
router.get("/exam-schedule/:id/lobby/me", authenticateUser, getMyExamScheduleLobbyStatus);
router.post("/exam-schedule/:id/lobby/join", authenticateUser, requestExamScheduleLobbyJoin);
router.post("/exam-schedule/:id/lobby/leave", authenticateUser, leaveExamScheduleLobby);
router.post("/exam-schedule/:id/lobby/:entryId/admit", authenticateUser, admitExamScheduleLobbyEntry);
router.post("/exam-schedule/:id/lobby/:entryId/deny", authenticateUser, denyExamScheduleLobbyEntry);
router.post("/exam-schedule/:id/lobby/admit-all", authenticateUser, admitAllExamScheduleLobby);

router.use(errorHandler);

module.exports = router;
