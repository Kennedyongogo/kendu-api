const {
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumSubject,
  CurriculumSubjectTopic,
  CurriculumSubjectSubtopic,
} = require("../models");
const { Op } = require("sequelize");
const { serializeTopicWithSubtopics } = require("../utils/curriculumTopicTree");

/** Default eager-load graph for curriculum subject API responses */
const subjectDetailIncludes = [
  { model: CurriculumClass, as: "curriculum_class", required: false },
  {
    model: CurriculumClassLevel,
    as: "curriculum_class_level",
    required: false,
    attributes: ["id", "name", "level_order", "curriculum_class_id"],
  },
];

const topicSubtopicsInclude = {
  model: CurriculumSubjectSubtopic,
  as: "subtopics",
  required: false,
  separate: true,
  order: [
    ["order_index", "ASC"],
    ["name", "ASC"],
  ],
};

function parseOptionalDateOnly(value) {
  if (value === undefined) return { provided: false };
  if (value === null || value === "") return { provided: true, value: null };
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { provided: true, error: "Dates must use YYYY-MM-DD format" };
  }
  return { provided: true, value: s };
}

function assertValidTermDateRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) {
    return "start_date cannot be after end_date";
  }
  return null;
}

function applyTermDateFields(payload, body) {
  const start = parseOptionalDateOnly(body.start_date);
  if (start.error) return { error: start.error };
  if (start.provided) payload.start_date = start.value;

  const end = parseOptionalDateOnly(body.end_date);
  if (end.error) return { error: end.error };
  if (end.provided) payload.end_date = end.value;

  const rangeError = assertValidTermDateRange(
    start.provided ? start.value : payload.start_date,
    end.provided ? end.value : payload.end_date
  );
  if (rangeError) return { error: rangeError };
  return { payload };
}

/**
 * When a subject is tied to a term (class level), ensure the level belongs to this curriculum
 * and align curriculum_class_id with the level's class.
 */
async function placementForSubjectTerm(curriculumId, curriculumClassId, levelId) {
  const level = await CurriculumClassLevel.findOne({
    where: { id: levelId },
    include: [
      {
        model: CurriculumClass,
        as: "curriculum_class",
        required: true,
        attributes: ["id", "curriculum_id"],
        where: { curriculum_id: curriculumId },
      },
    ],
  });
  if (!level) {
    const err = new Error("curriculum_class_level_id not found or does not belong to this curriculum");
    err.status = 400;
    throw err;
  }
  const classIdFromLevel = level.curriculum_class_id;
  if (
    curriculumClassId != null &&
    String(curriculumClassId).trim() !== "" &&
    String(curriculumClassId) !== String(classIdFromLevel)
  ) {
    const err = new Error("curriculum_class_id must match the class that owns this term");
    err.status = 400;
    throw err;
  }
  return {
    curriculum_class_level_id: levelId,
    curriculum_class_id: classIdFromLevel,
  };
}

async function curriculumOr404(curriculumId) {
  const c = await Curriculum.findByPk(curriculumId);
  if (!c) {
    const err = new Error("Curriculum not found");
    err.status = 404;
    throw err;
  }
  return c;
}

async function curriculumClassOr404(curriculumId, classId) {
  await curriculumOr404(curriculumId);
  const row = await CurriculumClass.findOne({
    where: { id: classId, curriculum_id: curriculumId },
  });
  if (!row) {
    const err = new Error("Class not found");
    err.status = 404;
    throw err;
  }
  return row;
}

function normalizeClassPeriod(body) {
  if (body.period === undefined) return undefined;
  const p = body.period != null ? String(body.period).trim() : "";
  return p === "" ? null : p.slice(0, 120);
}

async function subjectInCurriculumOr404(curriculumId, subjectId) {
  const row = await CurriculumSubject.findOne({
    where: { id: subjectId, curriculum_id: curriculumId },
    include: subjectDetailIncludes,
  });
  if (!row) {
    const err = new Error("Curriculum subject not found");
    err.status = 404;
    throw err;
  }
  return row;
}

function handleErr(res, error) {
  const status = error.status || (error.name === "SequelizeForeignKeyConstraintError" ? 400 : 500);
  return res.status(status).json({ success: false, message: error.message });
}

/* ---------- Curriculum classes ---------- */

exports.listCurriculumClasses = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const { count, rows } = await CurriculumClass.findAndCountAll({
      where: { curriculum_id: req.params.curriculumId },
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
    return handleErr(res, error);
  }
};

/** Paginated list of all curriculum classes (every curriculum), with parent curriculum embedded. */
exports.listAllCurriculumClasses = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const where = {};
    const cid = req.query.curriculum_id != null ? String(req.query.curriculum_id).trim() : "";
    if (cid) where.curriculum_id = cid;

    const { count, rows } = await CurriculumClass.findAndCountAll({
      where,
      include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: true }],
      order: [
        [{ model: Curriculum, as: "curriculum" }, "name", "ASC"],
        ["name", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
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
    return handleErr(res, error);
  }
};

exports.createCurriculumClass = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const allowed = ["name", "code", "description", "is_active"];
    const payload = { curriculum_id: req.params.curriculumId };
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    const np = normalizeClassPeriod(req.body);
    if (np !== undefined) payload.period = np;
    if (!payload.name || !payload.code) {
      return res.status(400).json({ success: false, message: "name and code are required" });
    }
    const row = await CurriculumClass.create(payload);
    const full = await CurriculumClass.findByPk(row.id);
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.getCurriculumClass = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const row = await CurriculumClass.findOne({
      where: { id: req.params.classId, curriculum_id: req.params.curriculumId },
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
    });
    if (!row) return res.status(404).json({ success: false, message: "Class not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.updateCurriculumClass = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const row = await CurriculumClass.findOne({
      where: { id: req.params.classId, curriculum_id: req.params.curriculumId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Class not found" });
    const allowed = ["name", "code", "description", "is_active"];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    const np = normalizeClassPeriod(req.body);
    if (np !== undefined) patch.period = np;
    await row.update(patch);
    const full = await CurriculumClass.findByPk(row.id, {
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
    });
    return res.json({ success: true, data: full });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.deleteCurriculumClass = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const row = await CurriculumClass.findOne({
      where: { id: req.params.classId, curriculum_id: req.params.curriculumId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Class not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return handleErr(res, error);
  }
};

/* ---------- Levels inside a curriculum class (e.g. Term 1, Term 2) ---------- */

/** Paginated list of all class levels (terms/phases), with curriculum + class embedded. */
exports.listAllCurriculumClassLevels = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const whereLevel = {};
    const classIdFilter = req.query.curriculum_class_id != null ? String(req.query.curriculum_class_id).trim() : "";
    if (classIdFilter) whereLevel.curriculum_class_id = classIdFilter;

    const q = req.query.q != null ? String(req.query.q).trim() : "";
    if (q) whereLevel.name = { [Op.iLike]: `%${q}%` };

    const termName = req.query.term_name != null ? String(req.query.term_name).trim() : "";
    if (termName) whereLevel.name = { [Op.iLike]: termName };

    const startFrom = req.query.start_date_from != null ? String(req.query.start_date_from).trim() : "";
    const startTo = req.query.start_date_to != null ? String(req.query.start_date_to).trim() : "";
    if (startFrom || startTo) {
      whereLevel.start_date = {};
      if (startFrom) whereLevel.start_date[Op.gte] = startFrom;
      if (startTo) whereLevel.start_date[Op.lte] = startTo;
    }

    const endFrom = req.query.end_date_from != null ? String(req.query.end_date_from).trim() : "";
    const endTo = req.query.end_date_to != null ? String(req.query.end_date_to).trim() : "";
    if (endFrom || endTo) {
      whereLevel.end_date = {};
      if (endFrom) whereLevel.end_date[Op.gte] = endFrom;
      if (endTo) whereLevel.end_date[Op.lte] = endTo;
    }

    const curriculumIdFilter = req.query.curriculum_id != null ? String(req.query.curriculum_id).trim() : "";
    const classWhere = {};
    if (curriculumIdFilter) classWhere.curriculum_id = curriculumIdFilter;

    const { count, rows } = await CurriculumClassLevel.findAndCountAll({
      where: whereLevel,
      include: [
        {
          model: CurriculumClass,
          as: "curriculum_class",
          required: true,
          attributes: ["id", "name", "code", "curriculum_id"],
          where: Object.keys(classWhere).length ? classWhere : undefined,
          include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: true }],
        },
      ],
      order: [
        [{ model: CurriculumClass, as: "curriculum_class" }, { model: Curriculum, as: "curriculum" }, "name", "ASC"],
        [{ model: CurriculumClass, as: "curriculum_class" }, "name", "ASC"],
        ["level_order", "ASC"],
        ["name", "ASC"],
      ],
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
    return handleErr(res, error);
  }
};

exports.listCurriculumClassLevels = async (req, res) => {
  try {
    await curriculumClassOr404(req.params.curriculumId, req.params.classId);
    const rows = await CurriculumClassLevel.findAll({
      where: { curriculum_class_id: req.params.classId },
      order: [
        ["level_order", "ASC"],
        ["name", "ASC"],
      ],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.createCurriculumClassLevel = async (req, res) => {
  try {
    await curriculumClassOr404(req.params.curriculumId, req.params.classId);
    const name = req.body.name != null ? String(req.body.name).trim() : "";
    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    let levelOrder = 0;
    if (req.body.level_order !== undefined) {
      const n = parseInt(req.body.level_order, 10);
      if (!Number.isNaN(n)) levelOrder = n;
    }
    const payload = {
      curriculum_class_id: req.params.classId,
      name,
      level_order: levelOrder,
    };
    if (req.body.description !== undefined) {
      const d = req.body.description != null ? String(req.body.description).trim() : "";
      payload.description = d === "" ? null : d;
    }
    const dates = applyTermDateFields(payload, req.body);
    if (dates.error) {
      return res.status(400).json({ success: false, message: dates.error });
    }
    const row = await CurriculumClassLevel.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.getCurriculumClassLevel = async (req, res) => {
  try {
    await curriculumClassOr404(req.params.curriculumId, req.params.classId);
    const row = await CurriculumClassLevel.findOne({
      where: { id: req.params.levelId, curriculum_class_id: req.params.classId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Level not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.updateCurriculumClassLevel = async (req, res) => {
  try {
    await curriculumClassOr404(req.params.curriculumId, req.params.classId);
    const row = await CurriculumClassLevel.findOne({
      where: { id: req.params.levelId, curriculum_class_id: req.params.classId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Level not found" });
    const patch = {};
    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) return res.status(400).json({ success: false, message: "name cannot be empty" });
      patch.name = n;
    }
    if (req.body.level_order !== undefined) {
      const n = parseInt(req.body.level_order, 10);
      patch.level_order = Number.isNaN(n) ? 0 : n;
    }
    if (req.body.description !== undefined) {
      const d = req.body.description != null ? String(req.body.description).trim() : "";
      patch.description = d === "" ? null : d;
    }
    const dates = applyTermDateFields(patch, req.body);
    if (dates.error) {
      return res.status(400).json({ success: false, message: dates.error });
    }
    const nextStart = patch.start_date !== undefined ? patch.start_date : row.start_date;
    const nextEnd = patch.end_date !== undefined ? patch.end_date : row.end_date;
    const rangeError = assertValidTermDateRange(nextStart, nextEnd);
    if (rangeError) {
      return res.status(400).json({ success: false, message: rangeError });
    }
    if (req.body.curriculum_class_id !== undefined) {
      const newClassId = req.body.curriculum_class_id != null ? String(req.body.curriculum_class_id).trim() : "";
      if (!newClassId) {
        return res.status(400).json({ success: false, message: "curriculum_class_id is required" });
      }
      const newClass = await CurriculumClass.findOne({
        where: { id: newClassId },
        attributes: ["id", "curriculum_id"],
      });
      if (!newClass) {
        return res.status(400).json({ success: false, message: "Class not found" });
      }
      patch.curriculum_class_id = newClassId;
    }
    await row.update(patch);
    const updated = await CurriculumClassLevel.findByPk(row.id, {
      include: [
        {
          model: CurriculumClass,
          as: "curriculum_class",
          attributes: ["id", "name", "code", "curriculum_id"],
          include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"] }],
        },
      ],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.deleteCurriculumClassLevel = async (req, res) => {
  try {
    await curriculumClassOr404(req.params.curriculumId, req.params.classId);
    const row = await CurriculumClassLevel.findOne({
      where: { id: req.params.levelId, curriculum_class_id: req.params.classId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Level not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return handleErr(res, error);
  }
};

/* ---------- Curriculum subjects ---------- */

/** Paginated list of all curriculum subjects (every curriculum), with curriculum, class, and term embedded. */
exports.listAllCurriculumSubjects = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const where = {};
    const cid = req.query.curriculum_id != null ? String(req.query.curriculum_id).trim() : "";
    if (cid) where.curriculum_id = cid;
    const ccid = req.query.curriculum_class_id != null ? String(req.query.curriculum_class_id).trim() : "";
    if (ccid) where.curriculum_class_id = ccid;
    const lid = req.query.curriculum_class_level_id != null ? String(req.query.curriculum_class_level_id).trim() : "";
    if (lid) where.curriculum_class_level_id = lid;

    const include = [
      { model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: true },
      ...subjectDetailIncludes,
    ];

    const { count, rows } = await CurriculumSubject.findAndCountAll({
      where,
      include,
      order: [
        [{ model: Curriculum, as: "curriculum" }, "name", "ASC"],
        [{ model: CurriculumClass, as: "curriculum_class" }, "name", "ASC"],
        ["name", "ASC"],
      ],
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
    return handleErr(res, error);
  }
};

exports.listCurriculumSubjects = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const where = { curriculum_id: req.params.curriculumId };
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.curriculum_class_level_id) where.curriculum_class_level_id = req.query.curriculum_class_level_id;
    const rows = await CurriculumSubject.findAll({
      where,
      include: subjectDetailIncludes,
      order: [["name", "ASC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.createCurriculumSubject = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const allowed = [
      "curriculum_class_id",
      "curriculum_class_level_id",
      "subject_id",
      "name",
      "description",
      "is_core",
      "is_active",
    ];
    const payload = { curriculum_id: req.params.curriculumId };
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }
    payload.name = payload.name != null ? String(payload.name).trim() : "";
    if (!payload.name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const rawLevelId = payload.curriculum_class_level_id;
    const hasTerm =
      rawLevelId !== undefined && rawLevelId !== null && String(rawLevelId).trim() !== "";
    if (hasTerm) {
      const p = await placementForSubjectTerm(
        req.params.curriculumId,
        payload.curriculum_class_id || null,
        String(rawLevelId).trim()
      );
      payload.curriculum_class_level_id = p.curriculum_class_level_id;
      payload.curriculum_class_id = p.curriculum_class_id;
    } else {
      payload.curriculum_class_level_id = null;
    }
    if (payload.curriculum_class_id) {
      const cc = await CurriculumClass.findOne({
        where: { id: payload.curriculum_class_id, curriculum_id: req.params.curriculumId },
      });
      if (!cc) {
        return res.status(400).json({ success: false, message: "curriculum_class_id does not belong to this curriculum" });
      }
    }
    const row = await CurriculumSubject.create(payload);
    const full = await CurriculumSubject.findByPk(row.id, {
      include: subjectDetailIncludes,
    });
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.getCurriculumSubject = async (req, res) => {
  try {
    const row = await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const includeTopics = req.query.include_topics === "true" || req.query.include === "all";
    const data = row.toJSON();
    if (includeTopics) {
      const topics = await CurriculumSubjectTopic.findAll({
        where: { curriculum_subject_id: row.id },
        include: [topicSubtopicsInclude],
        order: [
          ["order_index", "ASC"],
          ["name", "ASC"],
        ],
      });
      data.topic_tree = topics.map((t) => serializeTopicWithSubtopics(t));
    }
    return res.json({ success: true, data });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.updateCurriculumSubject = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const row = await CurriculumSubject.findOne({
      where: { id: req.params.subjectId, curriculum_id: req.params.curriculumId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Curriculum subject not found" });
    const allowed = [
      "curriculum_class_id",
      "curriculum_class_level_id",
      "subject_id",
      "name",
      "description",
      "is_core",
      "is_active",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      patch.name = n;
    }

    const levelSpecified = patch.curriculum_class_level_id !== undefined;
    const classSpecified = patch.curriculum_class_id !== undefined;

    const nextLevelId = levelSpecified
      ? patch.curriculum_class_level_id === null || patch.curriculum_class_level_id === ""
        ? null
        : patch.curriculum_class_level_id
      : row.curriculum_class_level_id;

    const nextClassId = classSpecified ? patch.curriculum_class_id || null : row.curriculum_class_id;

    const placementNeeded =
      levelSpecified || (classSpecified && row.curriculum_class_level_id);

    if (placementNeeded) {
      if (nextLevelId) {
        const p = await placementForSubjectTerm(req.params.curriculumId, nextClassId, nextLevelId);
        patch.curriculum_class_level_id = p.curriculum_class_level_id;
        patch.curriculum_class_id = p.curriculum_class_id;
      } else if (levelSpecified) {
        patch.curriculum_class_level_id = null;
      } else if (classSpecified && row.curriculum_class_level_id) {
        const p = await placementForSubjectTerm(
          req.params.curriculumId,
          nextClassId,
          row.curriculum_class_level_id
        );
        patch.curriculum_class_id = p.curriculum_class_id;
      }
    }

    if (patch.curriculum_class_id !== undefined && patch.curriculum_class_id) {
      const cc = await CurriculumClass.findOne({
        where: { id: patch.curriculum_class_id, curriculum_id: req.params.curriculumId },
      });
      if (!cc) {
        return res.status(400).json({ success: false, message: "curriculum_class_id does not belong to this curriculum" });
      }
    }
    await row.update(patch);
    const full = await CurriculumSubject.findByPk(row.id, {
      include: subjectDetailIncludes,
    });
    return res.json({ success: true, data: full });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.deleteCurriculumSubject = async (req, res) => {
  try {
    await curriculumOr404(req.params.curriculumId);
    const row = await CurriculumSubject.findOne({
      where: { id: req.params.subjectId, curriculum_id: req.params.curriculumId },
    });
    if (!row) return res.status(404).json({ success: false, message: "Curriculum subject not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return handleErr(res, error);
  }
};

/* ---------- Topics & subtopics ---------- */

exports.listCurriculumSubjectTopics = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const rows = await CurriculumSubjectTopic.findAll({
      where: { curriculum_subject_id: req.params.subjectId },
      order: [
        ["order_index", "ASC"],
        ["name", "ASC"],
      ],
    });
    return res.json({ success: true, data: rows.map((r) => r.toJSON()) });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.createCurriculumSubjectTopic = async (req, res) => {
  try {
    const parentSubject = await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const rawName =
      req.body.name != null && String(req.body.name).trim() !== ""
        ? String(req.body.name).trim()
        : req.body.title != null
          ? String(req.body.title).trim()
          : "";
    if (!rawName) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const descRaw = req.body.description != null ? String(req.body.description).trim() : "";
    const oi = parseInt(req.body.order_index, 10);
    const payload = {
      curriculum_subject_id: parentSubject.id,
      name: rawName,
      description: descRaw === "" ? null : descRaw,
      order_index: Number.isNaN(oi) ? 0 : oi,
      is_active: req.body.is_active === undefined ? true : Boolean(req.body.is_active),
    };
    const row = await CurriculumSubjectTopic.create(payload);
    return res.status(201).json({ success: true, data: row.toJSON() });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.getCurriculumSubjectTopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const row = await CurriculumSubjectTopic.findOne({
      where: {
        id: req.params.topicId,
        curriculum_subject_id: req.params.subjectId,
      },
      include: [topicSubtopicsInclude],
    });
    if (!row) return res.status(404).json({ success: false, message: "Topic not found" });
    return res.json({ success: true, data: serializeTopicWithSubtopics(row) });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.updateCurriculumSubjectTopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const row = await CurriculumSubjectTopic.findOne({
      where: {
        id: req.params.topicId,
        curriculum_subject_id: req.params.subjectId,
      },
    });
    if (!row) return res.status(404).json({ success: false, message: "Topic not found" });
    const patch = {};
    if (req.body.name !== undefined || req.body.title !== undefined) {
      const raw =
        req.body.name !== undefined ? String(req.body.name).trim() : String(req.body.title ?? "").trim();
      if (!raw) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      patch.name = raw;
    }
    if (req.body.description !== undefined) {
      const d = req.body.description != null ? String(req.body.description).trim() : "";
      patch.description = d === "" ? null : d;
    }
    if (req.body.order_index !== undefined) {
      const oi = parseInt(req.body.order_index, 10);
      patch.order_index = Number.isNaN(oi) ? 0 : oi;
    }
    if (req.body.is_active !== undefined) {
      patch.is_active = Boolean(req.body.is_active);
    }
    if (Object.keys(patch).length > 0) {
      await row.update(patch);
      await row.reload();
    }
    const full = await CurriculumSubjectTopic.findByPk(row.id, { include: [topicSubtopicsInclude] });
    return res.json({ success: true, data: serializeTopicWithSubtopics(full) });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.deleteCurriculumSubjectTopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const row = await CurriculumSubjectTopic.findOne({
      where: {
        id: req.params.topicId,
        curriculum_subject_id: req.params.subjectId,
      },
    });
    if (!row) return res.status(404).json({ success: false, message: "Topic not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.listCurriculumSubjectSubtopics = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const topic = await CurriculumSubjectTopic.findOne({
      where: { id: req.params.topicId, curriculum_subject_id: req.params.subjectId },
    });
    if (!topic) return res.status(404).json({ success: false, message: "Topic not found" });
    const rows = await CurriculumSubjectSubtopic.findAll({
      where: { curriculum_subject_topic_id: topic.id },
      order: [
        ["order_index", "ASC"],
        ["name", "ASC"],
      ],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.createCurriculumSubjectSubtopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const topic = await CurriculumSubjectTopic.findOne({
      where: { id: req.params.topicId, curriculum_subject_id: req.params.subjectId },
    });
    if (!topic) return res.status(404).json({ success: false, message: "Topic not found" });
    const rawName = req.body.name != null ? String(req.body.name).trim() : "";
    if (!rawName) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const descRaw = req.body.description != null ? String(req.body.description).trim() : "";
    const oi = parseInt(req.body.order_index, 10);
    const row = await CurriculumSubjectSubtopic.create({
      curriculum_subject_topic_id: topic.id,
      name: rawName,
      description: descRaw === "" ? null : descRaw,
      order_index: Number.isNaN(oi) ? 0 : oi,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.getCurriculumSubjectSubtopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const topic = await CurriculumSubjectTopic.findOne({
      where: { id: req.params.topicId, curriculum_subject_id: req.params.subjectId },
    });
    if (!topic) return res.status(404).json({ success: false, message: "Topic not found" });
    const row = await CurriculumSubjectSubtopic.findOne({
      where: { id: req.params.subtopicId, curriculum_subject_topic_id: topic.id },
    });
    if (!row) return res.status(404).json({ success: false, message: "Subtopic not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.updateCurriculumSubjectSubtopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const topic = await CurriculumSubjectTopic.findOne({
      where: { id: req.params.topicId, curriculum_subject_id: req.params.subjectId },
    });
    if (!topic) return res.status(404).json({ success: false, message: "Topic not found" });
    const row = await CurriculumSubjectSubtopic.findOne({
      where: { id: req.params.subtopicId, curriculum_subject_topic_id: topic.id },
    });
    if (!row) return res.status(404).json({ success: false, message: "Subtopic not found" });
    const patch = {};
    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      patch.name = n;
    }
    if (req.body.description !== undefined) {
      const d = req.body.description != null ? String(req.body.description).trim() : "";
      patch.description = d === "" ? null : d;
    }
    if (req.body.order_index !== undefined) {
      const oi = parseInt(req.body.order_index, 10);
      patch.order_index = Number.isNaN(oi) ? 0 : oi;
    }
    if (Object.keys(patch).length > 0) {
      await row.update(patch);
      await row.reload();
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.deleteCurriculumSubjectSubtopic = async (req, res) => {
  try {
    await subjectInCurriculumOr404(req.params.curriculumId, req.params.subjectId);
    const topic = await CurriculumSubjectTopic.findOne({
      where: { id: req.params.topicId, curriculum_subject_id: req.params.subjectId },
    });
    if (!topic) return res.status(404).json({ success: false, message: "Topic not found" });
    const row = await CurriculumSubjectSubtopic.findOne({
      where: { id: req.params.subtopicId, curriculum_subject_topic_id: topic.id },
    });
    if (!row) return res.status(404).json({ success: false, message: "Subtopic not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return handleErr(res, error);
  }
};
