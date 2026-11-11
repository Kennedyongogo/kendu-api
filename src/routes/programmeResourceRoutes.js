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
const {
  authenticateUser,
  authorizeRoles,
  READ_PROGRAMME_ROLES,
  WRITE_PROGRAMME_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canRead = [authenticateUser, authorizeRoles(READ_PROGRAMME_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_PROGRAMME_ROLES)];

// Fees
router.get("/fees", ...canRead, listAllFees);
router.get("/fees/:feeId", ...canRead, getFeeById);
router.post("/fees", ...canWrite, createFeeGlobal);
router.put("/fees/:feeId", ...canWrite, updateFeeGlobal);
router.delete("/fees/:feeId", ...canWrite, deleteFeeGlobal);

// Hours
router.get("/hours", ...canRead, listAllHourDistributions);
router.get("/hours/:hourId", ...canRead, getHourDistributionById);
router.post("/hours", ...canWrite, createHourDistributionGlobal);
router.put("/hours/:hourId", ...canWrite, updateHourDistributionGlobal);
router.delete("/hours/:hourId", ...canWrite, deleteHourDistributionGlobal);

// Modules
router.get("/modules", ...canRead, listAllModules);
router.get("/modules/:moduleId", ...canRead, getModuleById);
router.post("/modules", ...canWrite, createModuleGlobal);
router.put("/modules/:moduleId", ...canWrite, updateModuleGlobal);
router.delete("/modules/:moduleId", ...canWrite, deleteModuleGlobal);

// Subject requirements
router.get("/subjects", ...canRead, listAllSubjectRequirements);
router.get("/subjects/:requirementId", ...canRead, getSubjectRequirementById);
router.post("/subjects", ...canWrite, createSubjectRequirementGlobal);
router.put("/subjects/:requirementId", ...canWrite, updateSubjectRequirementGlobal);
router.delete("/subjects/:requirementId", ...canWrite, deleteSubjectRequirementGlobal);

router.use(errorHandler);

module.exports = router;
