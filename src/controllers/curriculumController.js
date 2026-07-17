const { Op } = require("sequelize");
const {
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumSubject,
  CurriculumSubjectTopic,
  CurriculumSubjectSubtopic,
} = require("../models");
const { serializeTopicWithSubtopics } = require("../utils/curriculumTopicTree");

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

exports.listPublicActive = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { count, rows } = await Curriculum.findAndCountAll({
      order: [["name", "ASC"]],
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

exports.listAllPublic = async (req, res) => {
  try {
    const curricula = await Curriculum.findAll({
      order: [["name", "ASC"]],
      attributes: ["id", "name", "type", "description", "period"],
    });
    return res.json({ success: true, data: curricula });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listCurricula = async (req, res) => {
  try {
    const where = {};
    if (req.query.type && String(req.query.type).trim()) {
      where.type = { [Op.iLike]: `%${String(req.query.type).trim()}%` };
    }

    const { page, limit, offset } = parsePagination(req);
    const { count, rows } = await Curriculum.findAndCountAll({
      where,
      order: [["name", "ASC"]],
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

exports.getCurriculum = async (req, res) => {
  try {
    const row = await Curriculum.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    if (req.query.include === "classes") {
      const curriculumId = row.id;
      const classes = await CurriculumClass.findAll({
        where: { curriculum_id: curriculumId },
        include: [
          {
            model: CurriculumClassLevel,
            as: "curriculum_class_levels",
            required: false,
            order: [
              ["level_order", "ASC"],
              ["name", "ASC"],
            ],
          },
        ],
        order: [["name", "ASC"]],
      });
      return res.json({
        success: true,
        data: {
          ...row.toJSON(),
          curriculum_classes: classes,
        },
      });
    }

    if (req.query.include === "structure") {
      const curriculumId = row.id;
      const classes = await CurriculumClass.findAll({
        where: { curriculum_id: curriculumId },
        include: [
          {
            model: CurriculumClassLevel,
            as: "curriculum_class_levels",
            required: false,
            separate: true,
            order: [
              ["level_order", "ASC"],
              ["name", "ASC"],
            ],
          },
        ],
        order: [["name", "ASC"]],
      });
      const subjects = await CurriculumSubject.findAll({
        where: { curriculum_id: curriculumId },
        include: [
          { model: CurriculumClass, as: "curriculum_class", required: false },
          {
            model: CurriculumClassLevel,
            as: "curriculum_class_level",
            required: false,
            attributes: ["id", "name", "level_order", "curriculum_class_id"],
          },
        ],
        order: [["name", "ASC"]],
      });
      const subjectIds = subjects.map((s) => s.id);
      const topics =
        subjectIds.length > 0
          ? await CurriculumSubjectTopic.findAll({
              where: { curriculum_subject_id: { [Op.in]: subjectIds } },
              include: [
                {
                  model: CurriculumSubjectSubtopic,
                  as: "subtopics",
                  required: false,
                  separate: true,
                  order: [
                    ["order_index", "ASC"],
                    ["name", "ASC"],
                  ],
                },
              ],
              order: [
                ["order_index", "ASC"],
                ["name", "ASC"],
              ],
            })
          : [];
      const topicsBySubject = {};
      for (const t of topics) {
        if (!topicsBySubject[t.curriculum_subject_id]) topicsBySubject[t.curriculum_subject_id] = [];
        topicsBySubject[t.curriculum_subject_id].push(t);
      }
      const curriculumSubjects = subjects.map((s) => {
        const j = s.toJSON();
        const ts = topicsBySubject[s.id] || [];
        j.topic_tree = ts.map((t) => serializeTopicWithSubtopics(t));
        return j;
      });

      return res.json({
        success: true,
        data: {
          ...row.toJSON(),
          curriculum_classes: classes,
          curriculum_subjects: curriculumSubjects,
        },
      });
    }

    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCurriculum = async (req, res) => {
  try {
    const name = req.body.name != null ? String(req.body.name).trim() : "";
    const type = req.body.type != null ? String(req.body.type).trim() : "";
    if (!name || !type) {
      return res.status(400).json({ success: false, message: "name and type are required" });
    }
    const description =
      req.body.description != null && String(req.body.description).trim() !== ""
        ? String(req.body.description).trim()
        : null;
    const periodRaw = req.body.period != null ? String(req.body.period).trim() : "";
    const period = periodRaw === "" ? null : periodRaw.slice(0, 120);
    const row = await Curriculum.create({ name, type, description, period });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateCurriculum = async (req, res) => {
  try {
    const row = await Curriculum.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    const patch = {};
    if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
    if (req.body.type !== undefined) patch.type = String(req.body.type).trim();
    if (req.body.description !== undefined) {
      const d = req.body.description != null ? String(req.body.description).trim() : "";
      patch.description = d === "" ? null : d;
    }
    if (req.body.period !== undefined) {
      const p = req.body.period != null ? String(req.body.period).trim() : "";
      patch.period = p === "" ? null : p.slice(0, 120);
    }
    if (patch.name !== undefined && !patch.name) {
      return res.status(400).json({ success: false, message: "name cannot be empty" });
    }
    if (patch.type !== undefined && !patch.type) {
      return res.status(400).json({ success: false, message: "type cannot be empty" });
    }
    await row.update(patch);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteCurriculum = async (req, res) => {
  try {
    const row = await Curriculum.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listPublicCurriculumClasses = async (req, res) => {
  try {
    const curriculumId = req.params.curriculumId;
    const classes = await CurriculumClass.findAll({
      where: { curriculum_id: curriculumId, is_active: true },
      order: [
        ["created_at", "DESC"],
        ["name", "ASC"],
      ],
      attributes: ["id", "name", "code", "description", "period"],
    });
    return res.json({ success: true, data: classes });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listPublicCurriculumClassLevels = async (req, res) => {
  try {
    const levels = await CurriculumClassLevel.findAll({
      where: { curriculum_class_id: req.params.classId },
      order: [
        ["level_order", "ASC"],
        ["name", "ASC"],
      ],
      attributes: ["id", "name", "level_order", "description"],
    });
    return res.json({ success: true, data: levels });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicGetCurriculum = async (req, res) => {
  try {
    const row = await Curriculum.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    const curriculumId = row.id;
    const classes = await CurriculumClass.findAll({
      where: { curriculum_id: curriculumId },
      include: [
        {
          model: CurriculumClassLevel,
          as: "curriculum_class_levels",
          required: false,
          order: [
            ["level_order", "ASC"],
            ["name", "ASC"],
          ],
        },
      ],
      order: [["name", "ASC"]],
    });

    return res.json({
      success: true,
      data: {
        ...row.toJSON(),
        curriculum_classes: classes,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
