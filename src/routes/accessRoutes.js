const express = require("express");
const {
  listPolicies,
  getPolicy,
  updatePolicy,
  getMyAccessStatus,
} = require("../controllers/accessController");
const {
  authenticateUser,
  authorizeRoles,
  SCHOOL_ADMIN_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

router.get("/me", ...studentsOnly, getMyAccessStatus);
router.get("/", ...adminOnly, listPolicies);
router.get("/:feature", ...adminOnly, getPolicy);
router.put("/:feature", ...adminOnly, updatePolicy);

router.use(errorHandler);

module.exports = router;
