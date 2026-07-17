const express = require("express");
const router = express.Router();
const {
  listAdminMeetings,
  listAdminMeetingsByDate,
  getAdminMeeting,
  createAdminMeeting,
  updateAdminMeeting,
  deleteAdminMeeting,
} = require("../controllers/adminMeetingController");
const {
  getAdminMeetingLiveSession,
  startAdminMeetingLive,
  endAdminMeetingLive,
} = require("../controllers/adminMeetingLiveController");
const { issueAdminMeetingLiveKitToken } = require("../controllers/adminMeetingLivekitTokenController");
const {
  getAdminMeetingLobby,
  getMyAdminMeetingLobbyStatus,
  requestAdminMeetingLobbyJoin,
  leaveAdminMeetingLobby,
  admitAdminMeetingLobbyEntry,
  denyAdminMeetingLobbyEntry,
  admitAllAdminMeetingLobby,
} = require("../controllers/adminMeetingLobbyController");
const {
  getAdminMeetingInteractions,
  postAdminMeetingChat,
  markAdminMeetingQuestionAnswered,
  postAdminMeetingReaction,
  raiseAdminMeetingHand,
  lowerAdminMeetingHand,
  dismissAdminMeetingHand,
} = require("../controllers/adminMeetingInteractionController");
const {
  getAdminMeetingReport,
  exportAdminMeetingReportPdf,
} = require("../controllers/adminMeetingReportController");
const { notifyAdminMeetingStaff } = require("../controllers/adminMeetingNotifyController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.use(authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES));

router.get("/", listAdminMeetings);
router.get("/by-date", listAdminMeetingsByDate);
router.post("/", createAdminMeeting);

router.get("/:id/live", getAdminMeetingLiveSession);
router.post("/:id/live/start", startAdminMeetingLive);
router.post("/:id/live/end", endAdminMeetingLive);
router.post("/:id/notify-staff", notifyAdminMeetingStaff);
router.post("/:id/livekit-token", issueAdminMeetingLiveKitToken);

router.get("/:id/lobby", getAdminMeetingLobby);
router.get("/:id/lobby/me", getMyAdminMeetingLobbyStatus);
router.post("/:id/lobby/join", requestAdminMeetingLobbyJoin);
router.post("/:id/lobby/leave", leaveAdminMeetingLobby);
router.post("/:id/lobby/admit-all", admitAllAdminMeetingLobby);
router.post("/:id/lobby/:entryId/admit", admitAdminMeetingLobbyEntry);
router.post("/:id/lobby/:entryId/deny", denyAdminMeetingLobbyEntry);

router.get("/:id/interactions", getAdminMeetingInteractions);
router.post("/:id/chat", postAdminMeetingChat);
router.patch("/:id/chat/:messageId/answered", markAdminMeetingQuestionAnswered);
router.post("/:id/reaction", postAdminMeetingReaction);
router.post("/:id/hand/raise", raiseAdminMeetingHand);
router.post("/:id/hand/lower", lowerAdminMeetingHand);
router.post("/:id/hand/:handId/dismiss", dismissAdminMeetingHand);

router.get("/:id/report/export", exportAdminMeetingReportPdf);
router.get("/:id/report", getAdminMeetingReport);

router.get("/:id", getAdminMeeting);
router.put("/:id", updateAdminMeeting);
router.delete("/:id", deleteAdminMeeting);

router.use(errorHandler);

module.exports = router;
