const express = require("express");
const { listSemesters } = require("../controllers/attendanceController");
const { authenticateUser, authorizeRoles, MOBILE_APP_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const mobileStaff = [authenticateUser, authorizeRoles(MOBILE_APP_ROLES)];

router.get("/semesters", ...mobileStaff, listSemesters);

router.use(errorHandler);

module.exports = router;
