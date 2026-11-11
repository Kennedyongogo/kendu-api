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
  ACCESS_MANAGE_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canManageAccess = [authenticateUser, authorizeRoles(ACCESS_MANAGE_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

router.get("/me", ...studentsOnly, getMyAccessStatus);
router.get("/", ...canManageAccess, listPolicies);
router.get("/:feature", ...canManageAccess, getPolicy);
router.put("/:feature", ...canManageAccess, updatePolicy);

router.use(errorHandler);

module.exports = router;
