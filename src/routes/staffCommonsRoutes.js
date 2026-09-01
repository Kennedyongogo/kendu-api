const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listBriefings,
  getBriefing,
  createBriefing,
  updateBriefing,
  deleteBriefing,
  markBriefingRead,
  deleteAttachment,
  listResources,
  listChannels,
  listChannelMessages,
  postChannelMessage,
  deleteChannelMessage,
  getOverview,
} = require("../controllers/staffCommonsController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const portalStaff = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

const uploadPath = path.join(__dirname, "..", "..", "uploads", "staff-commons");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || "";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      /^image\//i.test(file.mimetype) ||
      /^application\/pdf$/i.test(file.mimetype) ||
      /^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(
        file.mimetype
      ) ||
      /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i.test(
        file.mimetype
      ) ||
      /^text\/plain$/i.test(file.mimetype);
    if (allowed) return cb(null, true);
    cb(new Error("File type not allowed. Use PDF, Word, Excel, images, or text."));
  },
});

router.get("/overview", ...portalStaff, getOverview);
router.get("/briefings", ...portalStaff, listBriefings);
router.get("/briefings/:id", ...portalStaff, getBriefing);
router.post("/briefings", ...portalStaff, upload.array("attachments", 8), createBriefing);
router.put("/briefings/:id", ...portalStaff, upload.array("attachments", 8), updateBriefing);
router.delete("/briefings/:id", ...portalStaff, deleteBriefing);
router.post("/briefings/:id/read", ...portalStaff, markBriefingRead);
router.delete("/briefings/:id/attachments/:attachmentId", ...portalStaff, deleteAttachment);
router.get("/resources", ...portalStaff, listResources);
router.get("/channels", ...portalStaff, listChannels);
router.get("/channels/:id/messages", ...portalStaff, listChannelMessages);
router.post("/channels/:id/messages", ...portalStaff, postChannelMessage);
router.delete("/channels/:id/messages/:messageId", ...portalStaff, deleteChannelMessage);

router.use(errorHandler);

module.exports = router;
