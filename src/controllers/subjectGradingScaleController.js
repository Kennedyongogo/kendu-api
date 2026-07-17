const { Op } = require("sequelize");
const { SubjectGradingScale, Curriculum, CurriculumClass, CurriculumSubject } = require("../models");

const includes = [
  { model: Curriculum, as: "curriculum", required: false, attributes: ["id", "name", "type"] },
  { model: CurriculumClass, as: "curriculum_class", required: false, attributes: ["id", "name", "code"] },
  { model: CurriculumSubject, as: "curriculum_subject", required: false, attributes: ["id", "name", "subject_id"] },
];

async function ensureNoOverlap(payload, excludeId = null) {
  const min = Number(payload.min_mark);
  const max = Number(payload.max_mark);
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("min_mark and max_mark must be valid numbers.");
  if (min < 0 || max > 100) throw new Error("Grade bands must be inside 0..100.");
  if (min > max) throw new Error("min_mark cannot be greater than max_mark.");

  const where = {
    curriculum_id: payload.curriculum_id,
    curriculum_class_id: payload.curriculum_class_id,
    curriculum_subject_id: payload.curriculum_subject_id,
    [Op.and]: [{ min_mark: { [Op.lte]: max } }, { max_mark: { [Op.gte]: min } }],
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const overlapped = await SubjectGradingScale.findOne({ where });
  if (overlapped) throw new Error("Overlapping grade band exists for this curriculum/class/subject.");
}

exports.listSubjectScales = async (req, res) => {
  try {
    const where = {};
    if (req.query.curriculum_id) where.curriculum_id = req.query.curriculum_id;
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.curriculum_subject_id) where.curriculum_subject_id = req.query.curriculum_subject_id;
    if (req.query.is_active !== undefined) where.is_active = req.query.is_active === "true";
    const rows = await SubjectGradingScale.findAll({
      where,
      include: includes,
      order: [["sort_order", "ASC"], ["max_mark", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSubjectScale = async (req, res) => {
  try {
    await ensureNoOverlap(req.body || {});
    const row = await SubjectGradingScale.create(req.body || {});
    const created = await SubjectGradingScale.findByPk(row.id, { include: includes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSubjectScale = async (req, res) => {
  try {
    const row = await SubjectGradingScale.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Subject grading scale not found" });
    const payload = {
      curriculum_id: req.body.curriculum_id ?? row.curriculum_id,
      curriculum_class_id: req.body.curriculum_class_id ?? row.curriculum_class_id,
      curriculum_subject_id: req.body.curriculum_subject_id ?? row.curriculum_subject_id,
      min_mark: req.body.min_mark ?? row.min_mark,
      max_mark: req.body.max_mark ?? row.max_mark,
    };
    await ensureNoOverlap(payload, row.id);
    const allowed = ["curriculum_id", "curriculum_class_id", "curriculum_subject_id", "min_mark", "max_mark", "grade", "remarks", "points", "is_pass", "sort_order", "is_active"];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    await row.update(patch);
    const updated = await SubjectGradingScale.findByPk(row.id, { include: includes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteSubjectScale = async (req, res) => {
  try {
    const row = await SubjectGradingScale.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Subject grading scale not found" });
    await row.destroy();
    return res.json({ success: true, message: "Subject grading scale deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
