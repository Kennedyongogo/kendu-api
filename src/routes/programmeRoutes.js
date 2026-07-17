const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listProgrammes,
  getProgrammeById,
  createProgramme,
  updateProgramme,
  deleteProgramme,
  listHourDistributions,
  createHourDistribution,
  updateHourDistribution,
  deleteHourDistribution,
  listModules,
  createModule,
  updateModule,
  deleteModule,
  listFees,
  createFee,
  updateFee,
  deleteFee,
  listSubjectRequirements,
  createSubjectRequirement,
  updateSubjectRequirement,
  deleteSubjectRequirement,
  getProgrammeEnrolmentOptions,
} = require("../controllers/programmeController");
const { authenticateUser, authorizeRoles, ADMIN_PORTAL_API_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const programmesUploadPath = path.join(__dirname, "..", "..", "uploads", "programmes");
if (!fs.existsSync(programmesUploadPath)) {
  fs.mkdirSync(programmesUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, programmesUploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only image files (jpeg, png, webp, gif) are allowed"));
  },
});

const adminOnly = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

// Programmes
router.get("/", listProgrammes);
router.post("/", ...adminOnly, upload.single("image"), createProgramme);

// Hour distributions (nested — before /:id)
router.get("/:id/hour-distributions", listHourDistributions);
router.post("/:id/hour-distributions", ...adminOnly, createHourDistribution);
router.put("/:id/hour-distributions/:hourId", ...adminOnly, updateHourDistribution);
router.delete("/:id/hour-distributions/:hourId", ...adminOnly, deleteHourDistribution);

// Modules (nested — before /:id)
router.get("/:id/modules", listModules);
router.post("/:id/modules", ...adminOnly, createModule);
router.put("/:id/modules/:moduleId", ...adminOnly, updateModule);
router.delete("/:id/modules/:moduleId", ...adminOnly, deleteModule);

// Fee structure (nested — before /:id)
router.get("/:id/fees", listFees);
router.post("/:id/fees", ...adminOnly, createFee);
router.put("/:id/fees/:feeId", ...adminOnly, updateFee);
router.delete("/:id/fees/:feeId", ...adminOnly, deleteFee);

// Subject requirements (nested — before /:id)
router.get("/:id/subject-requirements", listSubjectRequirements);
router.post("/:id/subject-requirements", ...adminOnly, createSubjectRequirement);
router.put("/:id/subject-requirements/:requirementId", ...adminOnly, updateSubjectRequirement);
router.delete("/:id/subject-requirements/:requirementId", ...adminOnly, deleteSubjectRequirement);

router.get("/:id/enrolment-options", getProgrammeEnrolmentOptions);

router.get("/:id", getProgrammeById);
router.put("/:id", ...adminOnly, upload.single("image"), updateProgramme);
router.delete("/:id", ...adminOnly, deleteProgramme);

router.use(errorHandler);

module.exports = router;
