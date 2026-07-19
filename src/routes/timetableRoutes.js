const express = require("express");
const {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  getMyTimetable,
} = require("../controllers/timetableController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get(
  "/me",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  getMyTimetable
);

router.get(
  "/",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listEntries
);
router.post(
  "/",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  createEntry
);
router.get(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getEntry
);
router.put(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  updateEntry
);
router.delete(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  deleteEntry
);

router.use(errorHandler);

module.exports = router;
