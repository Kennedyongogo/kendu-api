const express = require("express");
const router = express.Router();
const {
  listOverallScales,
  createOverallScale,
  updateOverallScale,
  deleteOverallScale,
} = require("../controllers/overallGradingScaleController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listOverallScales);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createOverallScale);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateOverallScale);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteOverallScale);

router.use(errorHandler);

module.exports = router;
