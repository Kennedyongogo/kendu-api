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

router.get("/", listProgrammes);
router.get("/:id", getProgrammeById);
router.post(
  "/",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  upload.single("image"),
  createProgramme
);
router.put(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  upload.single("image"),
  updateProgramme
);
router.delete(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  deleteProgramme
);

router.use(errorHandler);

module.exports = router;
