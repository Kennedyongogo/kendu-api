const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listProgrammes,
  getProgrammeById,
  getMyProgramme,
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
const {
  authenticateUser,
  authorizeRoles,
  optionalAuth,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  READ_PROGRAMME_ROLES,
  WRITE_PROGRAMME_ROLES,
} = require("../middleware/auth");
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

const canWrite = [authenticateUser, authorizeRoles(WRITE_PROGRAMME_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];
const portalOrStudent = [
  authenticateUser,
  authorizeRoles([...READ_PROGRAMME_ROLES, ...PUBLIC_PORTAL_ALLOWED_ROLES]),
];

// Programmes
router.get("/", optionalAuth, listProgrammes);
router.post("/", ...canWrite, upload.single("image"), createProgramme);
router.get("/me", ...studentsOnly, getMyProgramme);

// Hour distributions (nested — before /:id)
router.get("/:id/hour-distributions", listHourDistributions);
router.post("/:id/hour-distributions", ...canWrite, createHourDistribution);
router.put("/:id/hour-distributions/:hourId", ...canWrite, updateHourDistribution);
router.delete("/:id/hour-distributions/:hourId", ...canWrite, deleteHourDistribution);

// Modules — staff/admin or students only (not public)
router.get("/:id/modules", ...portalOrStudent, listModules);
router.post("/:id/modules", ...canWrite, createModule);
router.put("/:id/modules/:moduleId", ...canWrite, updateModule);
router.delete("/:id/modules/:moduleId", ...canWrite, deleteModule);

// Fee structure (nested — before /:id)
router.get("/:id/fees", listFees);
router.post("/:id/fees", ...canWrite, createFee);
router.put("/:id/fees/:feeId", ...canWrite, updateFee);
router.delete("/:id/fees/:feeId", ...canWrite, deleteFee);

// Subject requirements (nested — before /:id)
router.get("/:id/subject-requirements", listSubjectRequirements);
router.post("/:id/subject-requirements", ...canWrite, createSubjectRequirement);
router.put("/:id/subject-requirements/:requirementId", ...canWrite, updateSubjectRequirement);
router.delete("/:id/subject-requirements/:requirementId", ...canWrite, deleteSubjectRequirement);

router.get("/:id/enrolment-options", getProgrammeEnrolmentOptions);

router.get("/:id", optionalAuth, getProgrammeById);
router.put("/:id", ...canWrite, upload.single("image"), updateProgramme);
router.delete("/:id", ...canWrite, deleteProgramme);

router.use(errorHandler);

module.exports = router;
