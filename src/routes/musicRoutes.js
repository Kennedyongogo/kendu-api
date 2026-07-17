const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  listPublicTracks,
  listTracks,
  getTrackById,
  createTrack,
  updateTrack,
  deleteTrack,
} = require("../controllers/musicController");
const { authenticateUser, authorizeRoles, ADMIN_PORTAL_API_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const musicUploadPath = path.join(__dirname, "..", "..", "uploads", "music");
if (!fs.existsSync(musicUploadPath)) {
  fs.mkdirSync(musicUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, musicUploadPath),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".mp3";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime = /^audio\//i.test(file.mimetype || "");
    const okExt = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.originalname || "");
    if (okMime || okExt) return cb(null, true);
    cb(new Error("Only audio files are allowed (mp3, wav, ogg, m4a, aac, flac, webm)"));
  },
});

const adminOnly = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

// Public: active tracks for home-page background music
router.get("/public", listPublicTracks);

// Admin CRUD
router.get("/", ...adminOnly, listTracks);
router.get("/:id", ...adminOnly, getTrackById);
router.post("/", ...adminOnly, upload.single("audio"), createTrack);
router.put("/:id", ...adminOnly, upload.single("audio"), updateTrack);
router.delete("/:id", ...adminOnly, deleteTrack);

router.use(errorHandler);

module.exports = router;
