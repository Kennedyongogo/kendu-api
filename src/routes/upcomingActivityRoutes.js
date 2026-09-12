const express = require("express");
const {
  listPublic,
  listMeta,
  listActivities,
  getActivity,
  createActivity,
  updateActivity,
  submitActivity,
  approveActivity,
  rejectActivity,
  deleteActivity,
} = require("../controllers/upcomingActivityController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
  SCHOOL_ADMIN_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const portalStaff = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];

router.get("/public", listPublic);
router.get("/meta", ...portalStaff, listMeta);
router.get("/", ...portalStaff, listActivities);
router.get("/:id", ...portalStaff, getActivity);
router.post("/", ...portalStaff, createActivity);
router.put("/:id", ...portalStaff, updateActivity);
router.post("/:id/submit", ...portalStaff, submitActivity);
router.post("/:id/approve", ...adminOnly, approveActivity);
router.post("/:id/reject", ...adminOnly, rejectActivity);
router.delete("/:id", ...adminOnly, deleteActivity);

router.use(errorHandler);

module.exports = router;
