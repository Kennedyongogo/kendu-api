const express = require("express");
const router = express.Router();
const { getStats } = require("../controllers/accountingController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

router.get("/stats", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), getStats);

router.use(errorHandler);

module.exports = router;
