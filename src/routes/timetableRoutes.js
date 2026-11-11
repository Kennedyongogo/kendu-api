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
  READ_TIMETABLE_ROLES,
  WRITE_TIMETABLE_ROLES,
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
  authorizeRoles(READ_TIMETABLE_ROLES),
  listEntries
);
router.post(
  "/",
  authenticateUser,
  authorizeRoles(WRITE_TIMETABLE_ROLES),
  createEntry
);
router.get(
  "/:id",
  authenticateUser,
  authorizeRoles(READ_TIMETABLE_ROLES),
  getEntry
);
router.put(
  "/:id",
  authenticateUser,
  authorizeRoles(WRITE_TIMETABLE_ROLES),
  updateEntry
);
router.delete(
  "/:id",
  authenticateUser,
  authorizeRoles(WRITE_TIMETABLE_ROLES),
  deleteEntry
);

router.use(errorHandler);

module.exports = router;
