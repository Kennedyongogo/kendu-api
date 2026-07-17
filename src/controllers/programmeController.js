const path = require("path");
const fs = require("fs");
const { Programme } = require("../models");
const { logFromRequest } = require("../middleware/auditLogger");

function programmeImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return filename;
  return `/uploads/programmes/${filename}`;
}

function serializeProgramme(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.image_url = programmeImageUrl(plain.image);
  return plain;
}

exports.listProgrammes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined) {
      where.is_active = String(req.query.is_active) === "true";
    }

    const { count, rows } = await Programme.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serializeProgramme),
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

exports.getProgrammeById = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }
    return res.json({ success: true, data: serializeProgramme(programme) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProgramme = async (req, res) => {
  try {
    const { name, description, duration, is_active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const image = req.file?.filename || req.body.image || null;

    const programme = await Programme.create({
      name: String(name).trim(),
      description: description || null,
      duration: duration || null,
      image,
      is_active: is_active === undefined ? true : is_active === true || is_active === "true",
    });

    await logFromRequest(req, {
      action: "create",
      resource_type: "programme",
      resource_id: programme.id,
      description: `Created programme "${programme.name}"`,
      new_values: serializeProgramme(programme),
      status: "success",
    });

    return res.status(201).json({ success: true, data: serializeProgramme(programme) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProgramme = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const oldValues = serializeProgramme(programme);
    const patch = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      patch.name = name;
    }
    if (req.body.description !== undefined) patch.description = req.body.description;
    if (req.body.duration !== undefined) patch.duration = req.body.duration;
    if (req.body.is_active !== undefined) {
      patch.is_active = req.body.is_active === true || req.body.is_active === "true";
    }
    if (req.file?.filename) {
      if (programme.image) {
        const oldPath = path.join(__dirname, "..", "..", "uploads", "programmes", programme.image);
        fs.unlink(oldPath, () => {});
      }
      patch.image = req.file.filename;
    } else if (req.body.image !== undefined) {
      patch.image = req.body.image || null;
    }

    await programme.update(patch);

    await logFromRequest(req, {
      action: "update",
      resource_type: "programme",
      resource_id: programme.id,
      description: `Updated programme "${programme.name}"`,
      old_values: oldValues,
      new_values: serializeProgramme(programme),
      status: "success",
    });

    return res.json({ success: true, data: serializeProgramme(programme) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProgramme = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const snapshot = serializeProgramme(programme);
    if (programme.image) {
      const imgPath = path.join(__dirname, "..", "..", "uploads", "programmes", programme.image);
      fs.unlink(imgPath, () => {});
    }
    await programme.destroy();

    await logFromRequest(req, {
      action: "delete",
      resource_type: "programme",
      resource_id: snapshot.id,
      description: `Deleted programme "${snapshot.name}"`,
      old_values: snapshot,
      status: "success",
    });

    return res.json({ success: true, message: "Programme deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
