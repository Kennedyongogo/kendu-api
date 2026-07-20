const { Op } = require("sequelize");
const { Department, Programme, ProgrammeDepartment, User } = require("../models");
const { logFromRequest } = require("../middleware/auditLogger");

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

function serializeDepartment(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  if (plain.programmes_count == null && Array.isArray(plain.programmes)) {
    plain.programmes_count = plain.programmes.length;
  }
  if (plain.staff_count == null && Array.isArray(plain.staff)) {
    plain.staff_count = plain.staff.length;
  }
  return plain;
}

function buildPayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.name !== undefined) {
    payload.name = body.name !== undefined ? String(body.name).trim() : undefined;
  }
  if (!partial || body.code !== undefined) {
    payload.code = toNullableString(body.code);
    if (payload.code) payload.code = payload.code.toUpperCase();
  }
  if (!partial || body.description !== undefined) {
    payload.description = toNullableString(body.description);
  }
  if (body.is_active !== undefined) {
    payload.is_active = toBool(body.is_active, true);
  }

  return payload;
}

exports.listDepartments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      where.is_active = toBool(req.query.is_active, true);
    }

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { code: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await Department.findAndCountAll({
      where,
      order: [["name", "ASC"]],
      limit,
      offset,
      distinct: true,
      include: [
        {
          model: Programme,
          as: "programmes",
          attributes: ["id"],
          through: { attributes: [] },
          required: false,
        },
        {
          model: User,
          as: "staff",
          attributes: ["id"],
          required: false,
          where: { role: { [Op.in]: ["admin", "staff"] } },
        },
      ],
    });

    return res.json({
      success: true,
      data: rows.map(serializeDepartment),
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

exports.getDepartmentById = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id, {
      include: [
        {
          model: Programme,
          as: "programmes",
          attributes: ["id", "name", "category", "is_active"],
          through: { attributes: [] },
          required: false,
        },
        {
          model: User,
          as: "staff",
          attributes: ["id", "full_name", "email", "role", "position", "is_active"],
          required: false,
          where: { role: { [Op.in]: ["admin", "staff"] } },
        },
      ],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    return res.json({ success: true, data: serializeDepartment(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    if (payload.is_active === undefined) payload.is_active = true;

    const row = await Department.create(payload);

    await logFromRequest(req, {
      action: "create",
      resource_type: "department",
      resource_id: row.id,
      description: `Created department "${row.name}"`,
      new_values: serializeDepartment(row),
      status: "success",
    });

    return res.status(201).json({ success: true, data: serializeDepartment(row) });
  } catch (error) {
    const duplicate =
      error.name === "SequelizeUniqueConstraintError" ||
      /unique|duplicate/i.test(error.message || "");
    return res.status(duplicate ? 400 : 500).json({
      success: false,
      message: duplicate ? "A department with that name or code already exists" : error.message,
    });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    const oldValues = serializeDepartment(row);
    const patch = buildPayload(req.body, { partial: true });
    if (patch.name !== undefined && !patch.name) {
      return res.status(400).json({ success: false, message: "name cannot be empty" });
    }

    await row.update(patch);

    await logFromRequest(req, {
      action: "update",
      resource_type: "department",
      resource_id: row.id,
      description: `Updated department "${row.name}"`,
      old_values: oldValues,
      new_values: serializeDepartment(row),
      status: "success",
    });

    return res.json({ success: true, data: serializeDepartment(row) });
  } catch (error) {
    const duplicate =
      error.name === "SequelizeUniqueConstraintError" ||
      /unique|duplicate/i.test(error.message || "");
    return res.status(duplicate ? 400 : 500).json({
      success: false,
      message: duplicate ? "A department with that name or code already exists" : error.message,
    });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    const [programmeCount, staffCount] = await Promise.all([
      ProgrammeDepartment.count({ where: { department_id: row.id } }),
      User.count({
        where: {
          department_id: row.id,
          role: { [Op.in]: ["admin", "staff"] },
        },
      }),
    ]);

    if (programmeCount > 0 || staffCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${programmeCount} programme(s) and ${staffCount} staff are still linked. Reassign them first or deactivate the department.`,
      });
    }

    const oldValues = serializeDepartment(row);
    await row.destroy();

    await logFromRequest(req, {
      action: "delete",
      resource_type: "department",
      resource_id: req.params.id,
      description: `Deleted department "${oldValues.name}"`,
      old_values: oldValues,
      status: "success",
    });

    return res.json({ success: true, message: "Department deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
