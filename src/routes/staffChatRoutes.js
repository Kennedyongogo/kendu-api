const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listContacts,
  listChats,
  openDirectChat,
  createGroupChat,
  getChat,
  listMessages,
  postMessage,
  markRead,
  signalTyping,
  listTyping,
  deleteMessage,
} = require("../controllers/staffChatController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const portalStaff = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

const uploadPath = path.join(__dirname, "..", "..", "uploads", "staff-chat");
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
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      /^image\//i.test(file.mimetype) ||
      /^video\//i.test(file.mimetype) ||
      /^audio\//i.test(file.mimetype) ||
      /^application\/pdf$/i.test(file.mimetype) ||
      /^application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(
        file.mimetype
      ) ||
      /^application\/(vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i.test(
        file.mimetype
      ) ||
      /^application\/(vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)$/i.test(
        file.mimetype
      ) ||
      /^text\/plain$/i.test(file.mimetype) ||
      /^application\/zip$/i.test(file.mimetype);
    if (allowed) return cb(null, true);
    cb(new Error("File type not allowed"));
  },
});

router.get("/contacts", ...portalStaff, listContacts);
router.get("/chats", ...portalStaff, listChats);
router.post("/chats/direct", ...portalStaff, openDirectChat);
router.post("/chats/group", ...portalStaff, createGroupChat);
router.get("/chats/:id", ...portalStaff, getChat);
router.get("/chats/:id/messages", ...portalStaff, listMessages);
router.post("/chats/:id/messages", ...portalStaff, upload.array("files", 8), postMessage);
router.post("/chats/:id/read", ...portalStaff, markRead);
router.post("/chats/:id/typing", ...portalStaff, signalTyping);
router.get("/chats/:id/typing", ...portalStaff, listTyping);
router.delete("/chats/:id/messages/:messageId", ...portalStaff, deleteMessage);

router.use(errorHandler);

module.exports = router;
