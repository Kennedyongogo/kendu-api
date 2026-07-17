const express = require("express");
const router = express.Router();
const {
  listSubjectScales,
  createSubjectScale,
  updateSubjectScale,
  deleteSubjectScale,
} = require("../controllers/subjectGradingScaleController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listSubjectScales);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createSubjectScale);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateSubjectScale);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteSubjectScale);

router.use(errorHandler);

module.exports = router;
