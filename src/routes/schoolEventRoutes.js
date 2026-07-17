const express = require("express");
const router = express.Router();
const {
  listPublished,
  listPublishedUpcoming,
  getPublishedBySlug,
  listSchoolEvents,
  getSchoolEvent,
  createSchoolEvent,
  updateSchoolEvent,
  deleteSchoolEvent,
  generatePosterForEvent,
} = require("../controllers/schoolEventController");
const {
  getEventLiveSession,
  startEventLive,
  endEventLive,
} = require("../controllers/eventLiveController");
const { issueEventLiveKitToken } = require("../controllers/eventLivekitTokenController");
const {
  getEventLobby,
  getMyEventLobbyStatus,
  requestEventLobbyJoin,
  leaveEventLobby,
  admitEventLobbyEntry,
  denyEventLobbyEntry,
  admitAllEventLobby,
} = require("../controllers/eventLobbyController");
const {
  getEventInteractions,
  postEventChat,
  markEventQuestionAnswered,
  postEventReaction,
  raiseEventHand,
  lowerEventHand,
  dismissEventHand,
} = require("../controllers/eventInteractionController");
const { getEventReport, exportEventReportPdf } = require("../controllers/eventReportController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/published/upcoming", listPublishedUpcoming);
router.get("/published", listPublished);
router.get("/published/slug/:slug", getPublishedBySlug);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listSchoolEvents);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createSchoolEvent);

router.post("/:id/generate-poster", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), generatePosterForEvent);

router.get("/:id/live", authenticateUser, getEventLiveSession);
router.post("/:id/live/start", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), startEventLive);
router.post("/:id/live/end", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), endEventLive);
router.post("/:id/livekit-token", authenticateUser, issueEventLiveKitToken);

router.get("/:id/lobby", authenticateUser, getEventLobby);
router.get("/:id/lobby/me", authenticateUser, getMyEventLobbyStatus);
router.post("/:id/lobby/join", authenticateUser, requestEventLobbyJoin);
router.post("/:id/lobby/leave", authenticateUser, leaveEventLobby);
router.post("/:id/lobby/admit-all", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), admitAllEventLobby);
router.post("/:id/lobby/:entryId/admit", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), admitEventLobbyEntry);
router.post("/:id/lobby/:entryId/deny", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), denyEventLobbyEntry);

router.get("/:id/interactions", authenticateUser, getEventInteractions);
router.post("/:id/chat", authenticateUser, postEventChat);
router.patch("/:id/chat/:messageId/answered", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), markEventQuestionAnswered);
router.post("/:id/reaction", authenticateUser, postEventReaction);
router.post("/:id/hand/raise", authenticateUser, raiseEventHand);
router.post("/:id/hand/lower", authenticateUser, lowerEventHand);
router.post("/:id/hand/:handId/dismiss", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), dismissEventHand);

router.get("/:id/report/export", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), exportEventReportPdf);
router.get("/:id/report", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getEventReport);

router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getSchoolEvent);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateSchoolEvent);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteSchoolEvent);

router.use(errorHandler);

module.exports = router;
