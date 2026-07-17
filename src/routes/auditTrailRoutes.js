const express = require("express");
const router = express.Router();
const { listAuditTrails, getAuditTrail } = require("../controllers/auditTrailController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.get("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listAuditTrails);
router.get("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getAuditTrail);

module.exports = router;
