const { Department, Teacher, User } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };

async function normalizeHeadOfDepartment(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = String(value).trim();
  if (!id) return null;
  const row = await Teacher.findByPk(id, { attributes: ["id"] });
  if (!row) {
    const err = new Error("head_of_department must be an existing teacher id");
    err.statusCode = 400;
    throw err;
  }
  return id;
}

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

exports.listDepartments = async (req, res) => {
  try {
    const where = {};
    if (req.query.is_active !== undefined) {
      where.is_active = req.query.is_active === "true";
    }
    const { page, limit, offset } = parsePagination(req);

    const include = [{ model: Teacher, as: "HOD", required: false, include: [{ model: User, as: "user", ...userSafe }] }];

    const { count, rows } = await Department.findAndCountAll({
      where,
      include,
      order: [["name", "ASC"]],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.json({
      success: true,
      data: rows,
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

exports.getDepartment = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id, {
      include: [{ model: Teacher, as: "HOD", required: false, include: [{ model: User, as: "user", ...userSafe }] }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.head_of_department !== undefined) {
      payload.head_of_department = await normalizeHeadOfDepartment(payload.head_of_department);
    }
    const row = await Department.create(payload);
    const created = await Department.findByPk(row.id, {
      include: [{ model: Teacher, as: "HOD", required: false, include: [{ model: User, as: "user", ...userSafe }] }],
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    const allowed = [
      "name",
      "code",
      "description",
      "head_of_department",
      "budget",
      "room_location",
      "email",
      "phone",
      "is_active",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.head_of_department !== undefined) {
      patch.head_of_department = await normalizeHeadOfDepartment(patch.head_of_department);
    }
    await row.update(patch);
    const updated = await Department.findByPk(row.id, {
      include: [{ model: Teacher, as: "HOD", required: false, include: [{ model: User, as: "user", ...userSafe }] }],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const row = await Department.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Department deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
