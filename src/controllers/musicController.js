const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const { Music } = require("../models");

// Served via /api so it works behind proxies that only forward /api (unlike /uploads)
function audioUrl(plain) {
  if (!plain.filename) return null;
  if (/^https?:\/\//i.test(plain.filename)) return plain.filename;
  return `/api/music/${plain.id}/stream`;
}

function serializeTrack(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.audio_url = audioUrl(plain);
  plain.volume = plain.volume != null ? Number(plain.volume) : 0.35;
  return plain;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function toBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function toInt(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toVolume(value, fallback = 0.35) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function unlinkMusicFile(filename) {
  if (!filename) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "music", filename);
  fs.unlink(filePath, () => {});
}

/** Public: stream a track's audio file (supports range requests for seeking) */
exports.streamTrack = async (req, res) => {
  try {
    // No is_active check: the admin portal previews inactive tracks via the same URL
    const row = await Music.findByPk(req.params.id);
    if (!row || !row.filename) {
      return res.status(404).json({ success: false, message: "Music track not found" });
    }
    if (/^https?:\/\//i.test(row.filename)) {
      return res.redirect(row.filename);
    }
    const filePath = path.join(__dirname, "..", "..", "uploads", "music", row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "Audio file missing on server" });
    }
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Public: active tracks for background playback */
exports.listPublicTracks = async (_req, res) => {
  try {
    const rows = await Music.findAll({
      where: { is_active: true },
      order: [
        ["sort_order", "ASC"],
        ["created_at", "ASC"],
      ],
    });
    return res.json({
      success: true,
      data: rows.map(serializeTrack),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Admin: paginated list (optional search / is_active) */
exports.listTracks = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      where.is_active = toBool(req.query.is_active, true);
    }
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${q}%` } },
          { description: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await Music.findAndCountAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serializeTrack),
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTrackById = async (req, res) => {
  try {
    const row = await Music.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Music track not found" });
    }
    return res.json({ success: true, data: serializeTrack(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTrack = async (req, res) => {
  try {
    const title = toNullableString(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }
    if (!req.file?.filename) {
      return res.status(400).json({ success: false, message: "audio file is required" });
    }

    const row = await Music.create({
      title,
      description: toNullableString(req.body.description),
      filename: req.file.filename,
      is_active: toBool(req.body.is_active, true),
      sort_order: toInt(req.body.sort_order, 0),
      volume: toVolume(req.body.volume, 0.35),
    });

    return res.status(201).json({ success: true, data: serializeTrack(row) });
  } catch (error) {
    if (req.file?.filename) unlinkMusicFile(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTrack = async (req, res) => {
  try {
    const row = await Music.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Music track not found" });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      const title = toNullableString(req.body.title);
      if (!title) {
        return res.status(400).json({ success: false, message: "title cannot be empty" });
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) {
      updates.description = toNullableString(req.body.description);
    }
    if (req.body.is_active !== undefined) {
      updates.is_active = toBool(req.body.is_active, row.is_active);
    }
    if (req.body.sort_order !== undefined) {
      updates.sort_order = toInt(req.body.sort_order, row.sort_order);
    }
    if (req.body.volume !== undefined) {
      updates.volume = toVolume(req.body.volume, Number(row.volume) || 0.35);
    }

    const previousFile = row.filename;
    if (req.file?.filename) {
      updates.filename = req.file.filename;
    }

    await row.update(updates);

    if (req.file?.filename && previousFile && previousFile !== req.file.filename) {
      unlinkMusicFile(previousFile);
    }

    return res.json({ success: true, data: serializeTrack(row) });
  } catch (error) {
    if (req.file?.filename) unlinkMusicFile(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTrack = async (req, res) => {
  try {
    const row = await Music.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Music track not found" });
    }
    const filename = row.filename;
    await row.destroy();
    unlinkMusicFile(filename);
    return res.json({ success: true, message: "Music track deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
