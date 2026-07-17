const express = require("express");
const router = express.Router();
const {
  listFeeStructures,
  getFeeStructure,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  listFeeStructuresByCurriculum,
} = require("../controllers/feeStructureController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/public/curriculum/:curriculum_id", listFeeStructuresByCurriculum);
router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listFeeStructures);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createFeeStructure);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getFeeStructure);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateFeeStructure);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteFeeStructure);

router.use(errorHandler);

module.exports = router;
