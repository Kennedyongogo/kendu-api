const { Op } = require("sequelize");
const { OverallGradingScale, Curriculum, CurriculumClass } = require("../models");

const includes = [
  { model: Curriculum, as: "curriculum", required: false, attributes: ["id", "name", "type"] },
  { model: CurriculumClass, as: "curriculum_class", required: false, attributes: ["id", "name", "code"] },
];

/** DECIMAL(6,2) upper bound — schools define their own total mark ranges. */
const SCORE_MAX = 999999.99;

function normalizeOverallPayload(body = {}) {
  const minRaw = body.min_score ?? body.range_from;
  const maxRaw = body.max_score ?? body.range_to;
  return {
    ...body,
    min_score: minRaw,
    max_score: maxRaw,
  };
}

async function ensureNoOverlap(payload, excludeId = null) {
  const min = Number(payload.min_score);
  const max = Number(payload.max_score);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error("Range from and range to must be valid numbers.");
  }
  if (min < 0 || max < 0) throw new Error("Score ranges cannot be negative.");
  if (min > SCORE_MAX || max > SCORE_MAX) {
    throw new Error(`Score ranges cannot exceed ${SCORE_MAX}.`);
  }
  if (min > max) throw new Error("Range from cannot be greater than range to.");
  const where = {
    curriculum_id: payload.curriculum_id,
    curriculum_class_id: payload.curriculum_class_id,
    [Op.and]: [{ min_score: { [Op.lte]: max } }, { max_score: { [Op.gte]: min } }],
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const overlapped = await OverallGradingScale.findOne({ where });
  if (overlapped) throw new Error("Overlapping overall grade band exists for this curriculum/class.");
}

exports.listOverallScales = async (req, res) => {
  try {
    const where = {};
    if (req.query.curriculum_id) where.curriculum_id = req.query.curriculum_id;
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.is_active !== undefined) where.is_active = req.query.is_active === "true";
    const rows = await OverallGradingScale.findAll({
      where,
      include: includes,
      order: [["sort_order", "ASC"], ["max_score", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

function normalizeOverallPayload(body = {}) {
  const min = body.min_score ?? body.range_from;
  const max = body.max_score ?? body.range_to;
  return {
    curriculum_id: body.curriculum_id,
    curriculum_class_id: body.curriculum_class_id,
    min_score: min,
    max_score: max,
    overall_grade: body.overall_grade,
    remarks: body.remarks ?? null,
    points: null,
    is_pass: body.is_pass,
    sort_order: body.sort_order,
    is_active: body.is_active,
  };
}

exports.createOverallScale = async (req, res) => {
  try {
    const payload = normalizeOverallPayload(req.body || {});
    await ensureNoOverlap(payload);
    const row = await OverallGradingScale.create(payload);
    const created = await OverallGradingScale.findByPk(row.id, { include: includes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateOverallScale = async (req, res) => {
  try {
    const row = await OverallGradingScale.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Overall grading scale not found" });
    const normalized = normalizeOverallPayload(req.body || {});
    const payload = {
      curriculum_id: normalized.curriculum_id ?? row.curriculum_id,
      curriculum_class_id: normalized.curriculum_class_id ?? row.curriculum_class_id,
      min_score: normalized.min_score ?? row.min_score,
      max_score: normalized.max_score ?? row.max_score,
    };
    await ensureNoOverlap(payload, row.id);
    const allowed = ["curriculum_id", "curriculum_class_id", "min_score", "max_score", "overall_grade", "remarks", "is_pass", "sort_order", "is_active"];
    const patch = {};
    for (const k of allowed) {
      if (normalized[k] !== undefined) patch[k] = normalized[k];
    }
    await row.update(patch);
    const updated = await OverallGradingScale.findByPk(row.id, { include: includes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteOverallScale = async (req, res) => {
  try {
    const row = await OverallGradingScale.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Overall grading scale not found" });
    await row.destroy();
    return res.json({ success: true, message: "Overall grading scale deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

