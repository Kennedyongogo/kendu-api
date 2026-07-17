const { SchoolService } = require("../models");
const { parsePagination } = require("../utils/pagination");

const ALLOWED_FIELDS = ["name", "description", "icon_key", "sort_order"];

function pickAllowed(body) {
  const payload = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  return payload;
}

const listOrder = [
  ["sort_order", "ASC"],
  ["name", "ASC"],
];

exports.listPublic = async (req, res) => {
  try {
    const rows = await SchoolService.findAll({
      order: listOrder,
      limit: Math.min(Number(req.query.limit) || 50, 100),
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listSchoolServices = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    const { count, rows } = await SchoolService.findAndCountAll({
      order: listOrder,
      limit,
      offset,
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

exports.getSchoolService = async (req, res) => {
  try {
    const row = await SchoolService.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSchoolService = async (req, res) => {
  try {
    const payload = pickAllowed(req.body);
    if (!payload.name || !payload.description) {
      return res.status(400).json({
        success: false,
        message: "name and description are required",
      });
    }
    const row = await SchoolService.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSchoolService = async (req, res) => {
  try {
    const row = await SchoolService.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.update(pickAllowed(req.body));
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSchoolService = async (req, res) => {
  try {
    const row = await SchoolService.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.reorderSchoolServices = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items must be a non-empty array of { id, sort_order }",
      });
    }

    await Promise.all(
      items.map(({ id, sort_order }) =>
        SchoolService.update({ sort_order }, { where: { id } })
      )
    );

    const rows = await SchoolService.findAll({ order: listOrder });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
