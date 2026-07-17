const { FeeStructure, Curriculum, CurriculumClass, CurriculumClassLevel } = require("../models");

function normalizeBreakdown(raw, termFeeAmount) {
  const halfAmount = Number.parseFloat((termFeeAmount / 2).toFixed(2));
  const fallback = [
    { phase: "first_half", amount: halfAmount, items: [] },
    { phase: "second_half", amount: halfAmount, items: [] },
  ];
  const list = Array.isArray(raw) ? raw : fallback;
  if (list.length !== 2) {
    throw new Error("payment_breakdown must contain exactly 2 entries");
  }
  const map = {};
  for (const item of list) {
    const phase = String(item?.phase || "").trim();
    if (!["first_half", "second_half"].includes(phase)) {
      throw new Error("payment_breakdown phases must be first_half and second_half");
    }
    const items = Array.isArray(item?.items) ? item.items : [];
    if (!items.length) {
      throw new Error(`payment_breakdown.${phase}.items must contain at least one item`);
    }
    const normalizedItems = items.map((it) => {
      const name = String(it?.name || "").trim();
      const amount = Number.parseFloat(it?.amount);
      if (!name) throw new Error(`payment_breakdown.${phase}.items requires item name`);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`payment_breakdown.${phase}.items amounts must be non-negative numbers`);
      }
      return { name, amount };
    });
    const itemsTotal = normalizedItems.reduce((acc, it) => acc + it.amount, 0);
    if (Math.abs(itemsTotal - halfAmount) > 0.01) {
      throw new Error(`Items in ${phase} must total ${halfAmount}`);
    }
    map[phase] = { phase, amount: halfAmount, items: normalizedItems };
  }
  const normalized = [
    map.first_half ?? { phase: "first_half", amount: halfAmount, items: [] },
    map.second_half ?? { phase: "second_half", amount: halfAmount, items: [] },
  ];
  const total = normalized[0].amount + normalized[1].amount;
  if (Math.abs(total - termFeeAmount) > 0.01) {
    throw new Error("payment_breakdown total must equal term_fee_amount");
  }
  return normalized;
}

async function assertCurriculumHierarchy({ curriculum_id, curriculum_class_id, curriculum_class_level_id }) {
  const curriculum = await Curriculum.findByPk(curriculum_id, { attributes: ["id"] });
  if (!curriculum) throw new Error("Invalid curriculum_id");

  const cclass = await CurriculumClass.findByPk(curriculum_class_id, {
    attributes: ["id", "curriculum_id"],
  });
  if (!cclass) throw new Error("Invalid curriculum_class_id");
  if (String(cclass.curriculum_id) !== String(curriculum_id)) {
    throw new Error("curriculum_class_id does not belong to curriculum_id");
  }

  const level = await CurriculumClassLevel.findByPk(curriculum_class_level_id, {
    attributes: ["id", "curriculum_class_id"],
  });
  if (!level) throw new Error("Invalid curriculum_class_level_id");
  if (String(level.curriculum_class_id) !== String(curriculum_class_id)) {
    throw new Error("curriculum_class_level_id does not belong to curriculum_class_id");
  }
}

exports.listFeeStructures = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = parseInt(req.query.limit, 10) || 10;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.curriculum_id) where.curriculum_id = req.query.curriculum_id;
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.curriculum_class_level_id) where.curriculum_class_level_id = req.query.curriculum_class_level_id;

    const { count, rows } = await FeeStructure.findAndCountAll({
      where,
      order: [
        ["created_at", "DESC"],
        ["term_fee_amount", "DESC"],
      ],
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

exports.getFeeStructure = async (req, res) => {
  try {
    const row = await FeeStructure.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createFeeStructure = async (req, res) => {
  try {
    const curriculum_id = req.body?.curriculum_id ? String(req.body.curriculum_id).trim() : "";
    const curriculum_class_id = req.body?.curriculum_class_id ? String(req.body.curriculum_class_id).trim() : "";
    const curriculum_class_level_id = req.body?.curriculum_class_level_id ? String(req.body.curriculum_class_level_id).trim() : "";
    const term_fee_amount = Number.parseFloat(req.body?.term_fee_amount);

    if (!curriculum_id || !curriculum_class_id || !curriculum_class_level_id) {
      return res.status(400).json({
        success: false,
        message: "curriculum_id, curriculum_class_id and curriculum_class_level_id are required",
      });
    }
    if (!Number.isFinite(term_fee_amount) || term_fee_amount < 0) {
      return res.status(400).json({ success: false, message: "term_fee_amount must be a non-negative number" });
    }

    await assertCurriculumHierarchy({ curriculum_id, curriculum_class_id, curriculum_class_level_id });
    const payment_breakdown = normalizeBreakdown(req.body?.payment_breakdown, term_fee_amount);

    const row = await FeeStructure.create({
      curriculum_id,
      curriculum_class_id,
      curriculum_class_level_id,
      term_fee_amount,
      payment_breakdown,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateFeeStructure = async (req, res) => {
  try {
    const row = await FeeStructure.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    const patch = {
      curriculum_id:
        req.body?.curriculum_id !== undefined ? String(req.body.curriculum_id || "").trim() : row.curriculum_id,
      curriculum_class_id:
        req.body?.curriculum_class_id !== undefined
          ? String(req.body.curriculum_class_id || "").trim()
          : row.curriculum_class_id,
      curriculum_class_level_id:
        req.body?.curriculum_class_level_id !== undefined
          ? String(req.body.curriculum_class_level_id || "").trim()
          : row.curriculum_class_level_id,
      term_fee_amount:
        req.body?.term_fee_amount !== undefined ? Number.parseFloat(req.body.term_fee_amount) : Number.parseFloat(row.term_fee_amount),
    };

    if (!patch.curriculum_id || !patch.curriculum_class_id || !patch.curriculum_class_level_id) {
      return res.status(400).json({
        success: false,
        message: "curriculum_id, curriculum_class_id and curriculum_class_level_id are required",
      });
    }
    if (!Number.isFinite(patch.term_fee_amount) || patch.term_fee_amount < 0) {
      return res.status(400).json({ success: false, message: "term_fee_amount must be a non-negative number" });
    }

    await assertCurriculumHierarchy(patch);
    patch.payment_breakdown = normalizeBreakdown(
      req.body?.payment_breakdown !== undefined ? req.body.payment_breakdown : row.payment_breakdown,
      patch.term_fee_amount
    );

    await row.update(patch);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteFeeStructure = async (req, res) => {
  try {
    const row = await FeeStructure.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listFeeStructuresByCurriculum = async (req, res) => {
  try {
    const { curriculum_id } = req.params;
    const rows = await FeeStructure.findAll({
      where: { curriculum_id },
      include: [
        { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "code"] },
        { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name", "level_order"] },
      ],
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
