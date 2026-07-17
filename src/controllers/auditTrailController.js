const { Op } = require("sequelize");
const { AuditTrail, User } = require("../models");

exports.listAuditTrails = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.action) where.action = req.query.action;
    if (req.query.resource_type) where.resource_type = req.query.resource_type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.q) {
      where.description = { [Op.iLike]: `%${String(req.query.q).trim()}%` };
    }

    const { count, rows } = await AuditTrail.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "email", "role"],
          required: false,
        },
      ],
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

exports.getAuditTrailById = async (req, res) => {
  try {
    const entry = await AuditTrail.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "email", "role"],
          required: false,
        },
      ],
    });
    if (!entry) {
      return res.status(404).json({ success: false, message: "Audit entry not found" });
    }
    return res.json({ success: true, data: entry });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
