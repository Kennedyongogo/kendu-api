const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listPublic,
  getPublicBySlug,
  listForStudents,
  listAll,
  getById,
  create,
  update,
  remove,
} = require("../controllers/announcementController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
  SCHOOL_ADMIN_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const uploadPath = path.join(__dirname, "..", "..", "uploads", "announcements");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only image files are allowed (jpeg, png, webp, gif)"));
  },
});

// Admin + staff may read; only admin may create / update / delete
const canView = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const canManage = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];

// Public site (before login)
router.get("/public", listPublic);
router.get("/public/:slug", getPublicBySlug);

// Student portal (any authenticated user; filtered to students / everyone)
router.get("/student", authenticateUser, listForStudents);

// Admin portal
router.get("/", ...canView, listAll);
router.get("/:id", ...canView, getById);
router.post("/", ...canManage, upload.single("cover"), create);
router.put("/:id", ...canManage, upload.single("cover"), update);
router.delete("/:id", ...canManage, remove);

router.use(errorHandler);

module.exports = router;
