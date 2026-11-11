const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listPublic,
  serveFile,
  listBrochures,
  getBrochure,
  createBrochure,
  updateBrochure,
  deleteBrochure,
} = require("../controllers/brochureController");
const {
  authenticateUser,
  authorizeRoles,
  BROCHURE_READ_ROLES,
  BROCHURE_WRITE_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const uploadPath = path.join(__dirname, "..", "..", "uploads", "brochures");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime =
      /^application\/pdf$/i.test(file.mimetype || "") ||
      /^image\//i.test(file.mimetype || "") ||
      /^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(
        file.mimetype || ""
      );
    const okExt = /\.(pdf|png|jpe?g|webp|doc|docx)$/i.test(file.originalname || "");
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Only PDF, Word, or image files are allowed"));
  },
});

const canView = [authenticateUser, authorizeRoles(BROCHURE_READ_ROLES)];
const canManage = [authenticateUser, authorizeRoles(BROCHURE_WRITE_ROLES)];

router.get("/public", listPublic);
router.get("/:id/file", serveFile);

router.get("/", ...canView, listBrochures);
router.get("/:id", ...canView, getBrochure);
router.post("/", ...canManage, upload.single("file"), createBrochure);
router.put("/:id", ...canManage, upload.single("file"), updateBrochure);
router.delete("/:id", ...canManage, deleteBrochure);

router.use(errorHandler);

module.exports = router;
