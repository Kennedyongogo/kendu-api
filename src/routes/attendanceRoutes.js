const express = require("express");
const {
  listClasses,
  getRoster,
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  downloadSessionPdf,
} = require("../controllers/attendanceController");
const { authenticateUser, authorizeRoles, STAFF_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const teaching = [authenticateUser, authorizeRoles(STAFF_ROLES)];

router.get("/classes", ...teaching, listClasses);
router.get("/roster", ...teaching, getRoster);
router.get("/sessions", ...teaching, listSessions);
router.post("/sessions", ...teaching, createSession);
router.get("/sessions/:id", ...teaching, getSession);
router.put("/sessions/:id", ...teaching, updateSession);
router.delete("/sessions/:id", ...teaching, deleteSession);
router.get("/sessions/:id/pdf", ...teaching, downloadSessionPdf);

router.use(errorHandler);

module.exports = router;
