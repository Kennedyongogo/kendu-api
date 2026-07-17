const { ExamTemplate, SchoolProfile, User } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };

const include = [
  { model: SchoolProfile, as: "school_profile", attributes: ["id", "name", "short_name", "logo_url", "website", "phone", "address"] },
  { model: User, as: "creator", required: false, ...userSafe },
  { model: User, as: "updater", required: false, ...userSafe },
];

exports.listExamTemplates = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = parseInt(req.query.limit, 10) || 10;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.is_active !== undefined) where.is_active = req.query.is_active === "true";
    if (req.query.school_profile_id) where.school_profile_id = req.query.school_profile_id;

    const { count, rows } = await ExamTemplate.findAndCountAll({
      where,
      include,
      order: [["updated_at", "DESC"]],
      limit,
      offset,
    });
    return res.json({
      success: true,
      data: rows,
      pagination: { total: count, page, limit, totalPages: Math.max(1, Math.ceil(count / limit)) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamTemplate = async (req, res) => {
  try {
    const row = await ExamTemplate.findByPk(req.params.id, { include });
    if (!row) return res.status(404).json({ success: false, message: "Exam template not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExamTemplate = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = body.name ? String(body.name).trim() : "";
    if (!name) return res.status(400).json({ success: false, message: "name is required" });

    let schoolProfileId = body.school_profile_id ? String(body.school_profile_id).trim() : "";
    if (!schoolProfileId) {
      const sp = await SchoolProfile.findOne({ order: [["updated_at", "DESC"]], attributes: ["id"] });
      schoolProfileId = sp?.id || null;
    }

    const row = await ExamTemplate.create({
      name,
      description: body.description ? String(body.description).trim() : null,
      school_profile_id: schoolProfileId || null,
      layout_json: body.layout_json && typeof body.layout_json === "object" ? body.layout_json : { elements: [] },
      paper_size: body.paper_size ? String(body.paper_size) : "A4",
      orientation: body.orientation ? String(body.orientation) : "portrait",
      is_active: body.is_active !== undefined ? !!body.is_active : true,
      created_by: req.user?.id || null,
      updated_by: req.user?.id || null,
    });
    const created = await ExamTemplate.findByPk(row.id, { include });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateExamTemplate = async (req, res) => {
  try {
    const row = await ExamTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Exam template not found" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = {};
    const allowed = ["name", "description", "school_profile_id", "layout_json", "paper_size", "orientation", "is_active"];
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (patch.name !== undefined) patch.name = String(patch.name || "").trim();
    patch.updated_by = req.user?.id || null;
    await row.update(patch);
    const updated = await ExamTemplate.findByPk(row.id, { include });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteExamTemplate = async (req, res) => {
  try {
    const row = await ExamTemplate.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Exam template not found" });
    await row.destroy();
    return res.json({ success: true, message: "Exam template deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.duplicateExamTemplate = async (req, res) => {
  try {
    const source = await ExamTemplate.findByPk(req.params.id);
    if (!source) return res.status(404).json({ success: false, message: "Exam template not found" });

    const suffix = String(req.body?.name_suffix || " (Copy)");
    const nextName = `${String(source.name || "Template").trim()}${suffix}`.slice(0, 200).trim();
    const row = await ExamTemplate.create({
      name: nextName || "Template (Copy)",
      description: source.description || null,
      school_profile_id: source.school_profile_id || null,
      layout_json: source.layout_json && typeof source.layout_json === "object" ? source.layout_json : { elements: [] },
      paper_size: source.paper_size || "A4",
      orientation: source.orientation || "portrait",
      is_active: true,
      created_by: req.user?.id || source.created_by || null,
      updated_by: req.user?.id || source.updated_by || null,
    });
    const duplicated = await ExamTemplate.findByPk(row.id, { include });
    return res.status(201).json({ success: true, data: duplicated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
