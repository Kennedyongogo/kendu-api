const { Op } = require("sequelize");
const { UpcomingActivity, User } = require("../models");

const SHAPES = [
  "circle",
  "pill",
  "rounded_square",
  "diamond",
  "hexagon",
  "oval",
  "speech_bubble",
  "ribbon",
  "banner",
  "star",
];
const ACCENTS = ["gold", "blue", "navy", "cream"];
const POSITIONS = ["top_right", "mid_right", "bottom_right", "top_left", "mid_left"];
const STATUSES = ["draft", "pending", "approved", "rejected"];

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function toInt(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function serialize(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.creator_name = plain.creator?.full_name || null;
  plain.approver_name = plain.approver?.full_name || null;
  delete plain.creator;
  delete plain.approver;
  return plain;
}

const includeUsers = [
  { model: User, as: "creator", attributes: ["id", "full_name"], required: false },
  { model: User, as: "approver", attributes: ["id", "full_name"], required: false },
];

function parseBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = toNullableString(body.title);
    if (!title) {
      const err = new Error("title is required");
      err.status = 400;
      throw err;
    }
    out.title = title.slice(0, 120);
  }
  if (!partial || body.body !== undefined) out.body = toNullableString(body.body)?.slice(0, 280) || null;
  if (!partial || body.shape !== undefined) {
    const shape = toNullableString(body.shape) || "pill";
    if (!SHAPES.includes(shape)) {
      const err = new Error("Invalid shape");
      err.status = 400;
      throw err;
    }
    out.shape = shape;
  }
  if (!partial || body.accent !== undefined) {
    const accent = toNullableString(body.accent) || "gold";
    if (!ACCENTS.includes(accent)) {
      const err = new Error("Invalid accent");
      err.status = 400;
      throw err;
    }
    out.accent = accent;
  }
  if (!partial || body.position_hint !== undefined) {
    const position_hint = toNullableString(body.position_hint) || "mid_right";
    if (!POSITIONS.includes(position_hint)) {
      const err = new Error("Invalid position");
      err.status = 400;
      throw err;
    }
    out.position_hint = position_hint;
  }
  if (!partial || body.display_start !== undefined) {
    out.display_start = toDate(body.display_start);
  }
  if (!partial || body.display_end !== undefined) {
    out.display_end = toDate(body.display_end);
  }
  if (!partial || body.sort_order !== undefined) {
    out.sort_order = toInt(body.sort_order, 0);
  }
  return out;
}

/** Public: approved activities currently in their display window */
exports.listPublic = async (_req, res) => {
  try {
    const now = new Date();
    const rows = await UpcomingActivity.findAll({
      where: {
        status: "approved",
        [Op.and]: [
          { [Op.or]: [{ display_start: null }, { display_start: { [Op.lte]: now } }] },
          { [Op.or]: [{ display_end: null }, { display_end: { [Op.gte]: now } }] },
        ],
      },
      order: [
        ["sort_order", "ASC"],
        ["approved_at", "DESC"],
      ],
      limit: 12,
    });
    return res.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMeta = async (_req, res) => {
  res.json({
    success: true,
    data: { shapes: SHAPES, accents: ACCENTS, positions: POSITIONS, statuses: STATUSES },
  });
};

exports.listActivities = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.status && STATUSES.includes(req.query.status)) {
      where.status = req.query.status;
    }
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${q}%` } },
          { body: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await UpcomingActivity.findAndCountAll({
      where,
      include: includeUsers,
      order: [
        ["sort_order", "ASC"],
        ["updated_at", "DESC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serialize),
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

exports.getActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id, { include: includeUsers });
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: serialize(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createActivity = async (req, res) => {
  try {
    const fields = parseBody(req.body);
    const row = await UpcomingActivity.create({
      ...fields,
      status: "draft",
      created_by: req.user.id,
    });
    const full = await UpcomingActivity.findByPk(row.id, { include: includeUsers });
    return res.status(201).json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.updateActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    if (row.status === "approved" && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Approved activities can only be edited by admin" });
    }
    const fields = parseBody(req.body, { partial: true });
    // Editing an approved item pulls it back to draft unless admin keeps it
    if (row.status === "approved" && req.body.keep_approved !== "true" && req.body.keep_approved !== true) {
      fields.status = "draft";
      fields.approved_by = null;
      fields.approved_at = null;
    }
    if (row.status === "rejected") {
      fields.status = "draft";
      fields.rejection_reason = null;
    }
    await row.update(fields);
    const full = await UpcomingActivity.findByPk(row.id, { include: includeUsers });
    return res.json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.submitActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    if (!["draft", "rejected"].includes(row.status)) {
      return res.status(400).json({ success: false, message: "Only draft or rejected items can be submitted" });
    }
    await row.update({
      status: "pending",
      rejection_reason: null,
    });
    const full = await UpcomingActivity.findByPk(row.id, { include: includeUsers });
    return res.json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    if (!["draft", "pending", "rejected"].includes(row.status)) {
      return res.status(400).json({ success: false, message: "Already approved" });
    }
    await row.update({
      status: "approved",
      approved_by: req.user.id,
      approved_at: new Date(),
      rejection_reason: null,
      display_start: row.display_start || new Date(),
    });
    const full = await UpcomingActivity.findByPk(row.id, { include: includeUsers });
    return res.json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    if (row.status !== "pending" && row.status !== "draft") {
      return res.status(400).json({ success: false, message: "Only draft/pending can be rejected" });
    }
    await row.update({
      status: "rejected",
      rejection_reason: toNullableString(req.body.reason)?.slice(0, 400) || null,
      approved_by: null,
      approved_at: null,
    });
    const full = await UpcomingActivity.findByPk(row.id, { include: includeUsers });
    return res.json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteActivity = async (req, res) => {
  try {
    const row = await UpcomingActivity.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.SHAPES = SHAPES;
exports.ACCENTS = ACCENTS;
exports.POSITIONS = POSITIONS;
