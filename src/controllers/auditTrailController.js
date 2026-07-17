const { Op } = require("sequelize");
const { AuditTrail, User } = require("../models");

const userAttrs = ["id", "full_name", "username", "email"];

exports.listAuditTrails = async (req, res) => {
  try {
    const where = {};
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.action) where.action = String(req.query.action).trim();
    if (req.query.resource_type) where.resource_type = String(req.query.resource_type).trim();
    if (req.query.status && ["success", "failed", "pending"].includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.search) {
      const term = `%${String(req.query.search).trim()}%`;
      where[Op.or] = [{ description: { [Op.iLike]: term } }, { resource_id: { [Op.iLike]: term } }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const count = await AuditTrail.count({ where });
    const rows = await AuditTrail.findAll({
      where,
      include: [{ model: User, as: "user", attributes: userAttrs, required: false }],
      order: [["created_at", "DESC"]],
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

exports.getAuditTrail = async (req, res) => {
  try {
    const row = await AuditTrail.findByPk(req.params.id, {
      include: [{ model: User, as: "user", attributes: userAttrs, required: false }],
    });
    if (!row) return res.status(404).json({ success: false, message: "Audit log not found." });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
