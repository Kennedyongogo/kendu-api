const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  login,
  register,
  me,
  listUsers,
  listPublicStaff,
  getUserById,
  createUser,
  updateUser,
  changePassword,
  toggleActive,
  deleteUser,
  downloadImportTemplate,
  importUsersExcel,
} = require("../controllers/userController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../middleware/auth");

const router = express.Router();

const profilesUploadPath = path.join(__dirname, "..", "..", "uploads", "profiles");
if (!fs.existsSync(profilesUploadPath)) {
  fs.mkdirSync(profilesUploadPath, { recursive: true });
}

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profilesUploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});

const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only image files (jpeg, png, webp, gif) are allowed"));
  },
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname || "")) return cb(null, true);
    cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
  },
});

router.post("/login", login);
router.post("/register", register);

router.get("/public/staff", listPublicStaff);

router.get("/me", authenticateUser, me);

router.post(
  "/",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  profileUpload.single("profile_image"),
  createUser
);
router.get("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), listUsers);

router.get(
  "/import-template",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  downloadImportTemplate
);
router.post(
  "/import-excel",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  excelUpload.single("file"),
  importUsersExcel
);

router.get("/:id", authenticateUser, getUserById);
router.put(
  "/:id",
  authenticateUser,
  profileUpload.single("profile_image"),
  updateUser
);
router.put("/:id/password", authenticateUser, changePassword);
router.put("/:id/toggle-status", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), toggleActive);
router.delete("/:id", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), deleteUser);

router.use(errorHandler);

module.exports = router;
