const { AdminMeeting } = require("../models");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

function isAdminPortalUser(req) {
  return ADMIN_PORTAL_API_ROLES.includes(req.user?.role);
}

function isMeetingCreator(req, meeting) {
  return meeting && String(meeting.created_by) === String(req.user?.id);
}

async function loadMeetingForLive(meetingId) {
  return AdminMeeting.findByPk(meetingId);
}

function assertMeetingExists(meeting) {
  if (!meeting) {
    const err = new Error("Meeting not found");
    err.statusCode = 404;
    throw err;
  }
}

async function assertCanAccessAdminMeeting(req, meeting) {
  assertMeetingExists(meeting);
  if (!isAdminPortalUser(req)) {
    const err = new Error("Only school staff can join admin meetings.");
    err.statusCode = 403;
    throw err;
  }
  return { role: isMeetingCreator(req, meeting) ? "host" : "participant" };
}

function assertCreatorCanAdmit(req, meeting) {
  if (!isMeetingCreator(req, meeting)) {
    const err = new Error("Only the meeting creator can admit or deny participants.");
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  isAdminPortalUser,
  isMeetingCreator,
  loadMeetingForLive,
  assertMeetingExists,
  assertCanAccessAdminMeeting,
  assertCreatorCanAdmit,
};
