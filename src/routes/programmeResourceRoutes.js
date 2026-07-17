const express = require("express");
const {
  listAllFees,
  getFeeById,
  createFeeGlobal,
  updateFeeGlobal,
  deleteFeeGlobal,
  listAllHourDistributions,
  getHourDistributionById,
  createHourDistributionGlobal,
  updateHourDistributionGlobal,
  deleteHourDistributionGlobal,
  listAllModules,
  getModuleById,
  createModuleGlobal,
  updateModuleGlobal,
  deleteModuleGlobal,
  listAllSubjectRequirements,
  getSubjectRequirementById,
  createSubjectRequirementGlobal,
  updateSubjectRequirementGlobal,
  deleteSubjectRequirementGlobal,
} = require("../controllers/programmeController");
const { authenticateUser, authorizeRoles, ADMIN_PORTAL_API_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const adminOnly = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

// Fees
router.get("/fees", ...adminOnly, listAllFees);
router.get("/fees/:feeId", ...adminOnly, getFeeById);
router.post("/fees", ...adminOnly, createFeeGlobal);
router.put("/fees/:feeId", ...adminOnly, updateFeeGlobal);
router.delete("/fees/:feeId", ...adminOnly, deleteFeeGlobal);

// Hours
router.get("/hours", ...adminOnly, listAllHourDistributions);
router.get("/hours/:hourId", ...adminOnly, getHourDistributionById);
router.post("/hours", ...adminOnly, createHourDistributionGlobal);
router.put("/hours/:hourId", ...adminOnly, updateHourDistributionGlobal);
router.delete("/hours/:hourId", ...adminOnly, deleteHourDistributionGlobal);

// Modules
router.get("/modules", ...adminOnly, listAllModules);
router.get("/modules/:moduleId", ...adminOnly, getModuleById);
router.post("/modules", ...adminOnly, createModuleGlobal);
router.put("/modules/:moduleId", ...adminOnly, updateModuleGlobal);
router.delete("/modules/:moduleId", ...adminOnly, deleteModuleGlobal);

// Subject requirements
router.get("/subjects", ...adminOnly, listAllSubjectRequirements);
router.get("/subjects/:requirementId", ...adminOnly, getSubjectRequirementById);
router.post("/subjects", ...adminOnly, createSubjectRequirementGlobal);
router.put("/subjects/:requirementId", ...adminOnly, updateSubjectRequirementGlobal);
router.delete("/subjects/:requirementId", ...adminOnly, deleteSubjectRequirementGlobal);

router.use(errorHandler);

module.exports = router;
