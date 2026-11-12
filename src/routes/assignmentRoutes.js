const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listAssignments,
  summaryAssignments,
  listMyAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  serveAssignmentDocument,
} = require("../controllers/assignmentController");
const {
  authenticateUser,
  authorizeRoles,
  READ_ASSIGNMENT_ROLES,
  WRITE_ASSIGNMENT_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const uploadPath = path.join(__dirname, "..", "..", "uploads", "assignments");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
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
      ) ||
      /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i.test(
        file.mimetype || ""
      ) ||
      /^application\/(vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)$/i.test(
        file.mimetype || ""
      ) ||
      /^text\/plain$/i.test(file.mimetype || "");
    const okExt = /\.(pdf|png|jpe?g|webp|doc|docx|xls|xlsx|ppt|pptx|txt)$/i.test(
      file.originalname || ""
    );
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Only PDF, Office, image, or text files are allowed"));
  },
});

const canView = [authenticateUser, authorizeRoles(READ_ASSIGNMENT_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_ASSIGNMENT_ROLES)];

router.get(
  "/me",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  listMyAssignments
);
router.get("/summary", ...canView, summaryAssignments);
router.get("/", ...canView, listAssignments);
router.get("/:id/document", authenticateUser, serveAssignmentDocument);
router.get("/:id", ...canView, getAssignmentById);
router.post("/", ...canWrite, upload.single("document"), createAssignment);
router.put("/:id", ...canWrite, upload.single("document"), updateAssignment);
router.delete("/:id", ...canWrite, deleteAssignment);

router.use(errorHandler);

module.exports = router;
