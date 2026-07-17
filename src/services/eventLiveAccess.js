const { SchoolEvent } = require("../models");
const {
  ADMIN_PORTAL_API_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../constants/userRoles");
const { isOnlineDelivery } = require("./eventLiveProvision");

function isEventStaff(req) {
  return ADMIN_PORTAL_API_ROLES.includes(req.user?.role);
}

function isPortalAttendee(req) {
  return PUBLIC_PORTAL_ALLOWED_ROLES.includes(req.user?.role);
}

async function loadEventForLive(eventId) {
  return SchoolEvent.findByPk(eventId);
}

function assertEventSupportsLive(event) {
  if (!event) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }
  if (!isOnlineDelivery(event.delivery_mode)) {
    const err = new Error("This event is not configured for online participation.");
    err.statusCode = 400;
    throw err;
  }
}

async function assertCanAccessEventLive(req, event) {
  assertEventSupportsLive(event);
  if (isEventStaff(req)) {
    return { role: "host" };
  }
  if (isPortalAttendee(req)) {
    return { role: req.user.role };
  }
  const err = new Error("Forbidden");
  err.statusCode = 403;
  throw err;
}

module.exports = {
  isEventStaff,
  isPortalAttendee,
  loadEventForLive,
  assertEventSupportsLive,
  assertCanAccessEventLive,
};
