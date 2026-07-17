const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  login,
  register,
  me,
  listUsers,
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

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");

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

router.get("/me", authenticateUser, me);

router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createUser);
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
router.put("/:id", authenticateUser, updateUser);
router.put("/:id/password", authenticateUser, changePassword);
router.put("/:id/toggle-status", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), toggleActive);
router.delete("/:id", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), deleteUser);

router.use(errorHandler);

module.exports = router;
