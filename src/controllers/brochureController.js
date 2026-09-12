const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const { Brochure } = require("../models");

function fileUrl(plain) {
  if (!plain.filename) return null;
  if (/^https?:\/\//i.test(plain.filename)) return plain.filename;
  return `/api/brochures/${plain.id}/file`;
}

function serializeBrochure(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.file_url = fileUrl(plain);
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

function unlinkBrochureFile(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "brochures", filename);
  fs.unlink(filePath, () => {});
}

/** Public/admin: stream or download the uploaded file */
exports.serveFile = async (req, res) => {
  try {
    const row = await Brochure.findByPk(req.params.id);
    if (!row || !row.filename) {
      return res.status(404).json({ success: false, message: "Brochure not found" });
    }
    if (/^https?:\/\//i.test(row.filename)) {
      return res.redirect(row.filename);
    }
    const filePath = path.join(__dirname, "..", "..", "uploads", "brochures", row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "File missing on server" });
    }
    const downloadName = row.original_name || row.filename;
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(downloadName).replace(/"/g, "")}"`
    );
    if (row.mime_type) {
      res.type(row.mime_type);
    } else if (/\.pdf$/i.test(row.filename || "")) {
      res.type("application/pdf");
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Public: active brochures for the school website */
exports.listPublic = async (_req, res) => {
  try {
    const rows = await Brochure.findAll({
      where: { is_active: true },
      order: [
        ["sort_order", "ASC"],
        ["created_at", "DESC"],
      ],
    });
    return res.json({
      success: true,
      data: rows.map(serializeBrochure),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Admin list */
exports.listBrochures = async (req, res) => {
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

    const { count, rows } = await Brochure.findAndCountAll({
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
      data: rows.map(serializeBrochure),
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

exports.getBrochure = async (req, res) => {
  try {
    const row = await Brochure.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Brochure not found" });
    }
    return res.json({ success: true, data: serializeBrochure(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createBrochure = async (req, res) => {
  try {
    const title = toNullableString(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }
    if (!req.file?.filename) {
      return res.status(400).json({ success: false, message: "file is required" });
    }

    const row = await Brochure.create({
      title,
      description: toNullableString(req.body.description),
      filename: req.file.filename,
      original_name: req.file.originalname || req.file.filename,
      mime_type: req.file.mimetype || null,
      file_size: req.file.size || null,
      is_active: toBool(req.body.is_active, true),
      sort_order: toInt(req.body.sort_order, 0),
    });

    return res.status(201).json({ success: true, data: serializeBrochure(row) });
  } catch (error) {
    if (req.file?.filename) unlinkBrochureFile(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBrochure = async (req, res) => {
  try {
    const row = await Brochure.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Brochure not found" });
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

    const previousFile = row.filename;
    if (req.file?.filename) {
      updates.filename = req.file.filename;
      updates.original_name = req.file.originalname || req.file.filename;
      updates.mime_type = req.file.mimetype || null;
      updates.file_size = req.file.size || null;
    }

    await row.update(updates);

    if (req.file?.filename && previousFile && previousFile !== req.file.filename) {
      unlinkBrochureFile(previousFile);
    }

    return res.json({ success: true, data: serializeBrochure(row) });
  } catch (error) {
    if (req.file?.filename) unlinkBrochureFile(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBrochure = async (req, res) => {
  try {
    const row = await Brochure.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Brochure not found" });
    }
    const filename = row.filename;
    await row.destroy();
    unlinkBrochureFile(filename);
    return res.json({ success: true, message: "Brochure deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
