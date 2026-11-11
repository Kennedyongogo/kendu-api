const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} = require("../controllers/admissionController");
const {
  authenticateUser,
  authorizeRoles,
  READ_ADMISSION_ROLES,
  WRITE_ADMISSION_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const admissionsUploadPath = path.join(__dirname, "..", "..", "uploads", "admissions");
if (!fs.existsSync(admissionsUploadPath)) {
  fs.mkdirSync(admissionsUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, admissionsUploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf)$/i.test(file.mimetype)
    ) {
      return cb(null, true);
    }
    cb(new Error("Only image or PDF files are allowed for admission documents"));
  },
});

const documentUpload = upload.fields([
  { name: "kcse_certificate", maxCount: 1 },
  { name: "result_slip", maxCount: 1 },
  { name: "birth_certificate", maxCount: 1 },
  { name: "id_document", maxCount: 1 },
]);

const canRead = [authenticateUser, authorizeRoles(READ_ADMISSION_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_ADMISSION_ROLES)];

// Public: submit admission application
router.post("/", documentUpload, createApplication);

router.get("/", ...canRead, listApplications);
router.get("/:id", ...canRead, getApplicationById);
router.put("/:id/status", ...canWrite, updateApplicationStatus);
router.put("/:id", ...canWrite, documentUpload, updateApplication);
router.delete("/:id", ...canWrite, deleteApplication);

router.use(errorHandler);

module.exports = router;
