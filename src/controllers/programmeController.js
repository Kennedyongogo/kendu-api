const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const {
  Programme,
  ProgrammeHourDistribution,
  ProgrammeModule,
  ProgrammeFee,
  ProgrammeSubjectRequirement,
  Department,
  ProgrammeDepartment,
  sequelize,
} = require("../models");
const { logFromRequest } = require("../middleware/auditLogger");

const CATEGORIES = ["certificate", "diploma", "higher_diploma"];
const MODES = ["full_time", "part_time"];

const PROGRAMME_SCALAR_FIELDS = [
  "description",
  "duration",
  "category",
  "award",
  "minimum_kcse_grade",
  "mode",
  "weeks_per_year",
  "duration_years",
  "semester_1_weeks",
  "semester_1_period",
  "semester_2_weeks",
  "semester_2_period",
  "break_mid_sem1",
  "break_end_sem1",
  "break_end_sem2",
];

const INTEGER_FIELDS = new Set([
  "weeks_per_year",
  "duration_years",
  "semester_1_weeks",
  "semester_2_weeks",
  "year_1_hours",
  "year_2_hours",
  "year_3_hours",
  "total_hours",
  "hours",
  "credits",
  "year_of_study",
  "sort_order",
]);

function programmeImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return filename;
  return `/uploads/programmes/${filename}`;
}

function parseMaybeJson(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toInt(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function toMoney(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

function serializeProgramme(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.image_url = programmeImageUrl(plain.image);

  const fees = Array.isArray(plain.fee_structure) ? plain.fee_structure : [];
  plain.total_fee = fees.reduce((sum, fee) => sum + toMoney(fee.amount), 0);
  plain.fee_currency = fees[0]?.currency || "KES";

  const departments = Array.isArray(plain.departments) ? plain.departments : [];
  plain.departments = departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    is_active: d.is_active,
  }));
  plain.department_ids = plain.departments.map((d) => d.id);
  // Convenience for older UI that expected a single department
  plain.department = plain.departments[0] || null;

  return plain;
}

function normalizeHourRow(item, programmeId, index = 0) {
  const y1 = toInt(item.year_1_hours);
  const y2 = toInt(item.year_2_hours);
  const y3 = toInt(item.year_3_hours);
  const total =
    item.total_hours !== undefined && item.total_hours !== null && item.total_hours !== ""
      ? toInt(item.total_hours)
      : y1 + y2 + y3;

  return {
    programme_id: programmeId,
    nature: String(item.nature || "").trim(),
    specific_nature: toNullableString(item.specific_nature),
    year_1_hours: y1,
    year_2_hours: y2,
    year_3_hours: y3,
    total_hours: total,
    sort_order: toInt(item.sort_order, index),
  };
}

function normalizeModuleRow(item, programmeId, index = 0) {
  return {
    programme_id: programmeId,
    code: String(item.code || "").trim(),
    name: String(item.name || "").trim(),
    hours: toInt(item.hours),
    credits: toInt(item.credits),
    semester: toNullableString(item.semester),
    year_of_study: toNullableInt(item.year_of_study),
    sort_order: toInt(item.sort_order, index),
  };
}

function normalizeFeeRow(item, programmeId, index = 0) {
  const year = toInt(item.year_of_study, 0);
  const semester = toInt(item.semester, 0);
  if (year < 1 || semester < 1 || semester > 2) {
    const err = new Error(
      "fee_structure[].year_of_study (>=1) and semester (1 or 2) are required"
    );
    err.status = 400;
    throw err;
  }

  return {
    programme_id: programmeId,
    year_of_study: year,
    semester,
    amount: toMoney(item.amount),
    currency: toNullableString(item.currency) || "KES",
    label: toNullableString(item.label),
    sort_order: toInt(
      item.sort_order,
      (year - 1) * 2 + (semester - 1) || index
    ),
  };
}

function normalizeSubjectRequirementRow(item, programmeId, index = 0) {
  const subject = String(item.subject || "").trim();
  const minimum_grade = String(item.minimum_grade || "").trim();
  if (!subject || !minimum_grade) {
    const err = new Error(
      "subject_requirements[].subject and subject_requirements[].minimum_grade are required"
    );
    err.status = 400;
    throw err;
  }

  return {
    programme_id: programmeId,
    subject,
    minimum_grade,
    is_required:
      item.is_required === undefined
        ? true
        : item.is_required === true || item.is_required === "true",
    sort_order: toInt(item.sort_order, index),
  };
}

function buildProgrammePayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.name !== undefined) {
    payload.name = body.name !== undefined ? String(body.name).trim() : undefined;
  }

  for (const field of PROGRAMME_SCALAR_FIELDS) {
    if (body[field] === undefined) continue;
    if (INTEGER_FIELDS.has(field)) {
      payload[field] = toNullableInt(body[field]);
    } else if (field === "category") {
      const v = toNullableString(body[field]);
      if (v && !CATEGORIES.includes(v)) {
        const err = new Error(`category must be one of: ${CATEGORIES.join(", ")}`);
        err.status = 400;
        throw err;
      }
      payload[field] = v;
    } else if (field === "mode") {
      const v = toNullableString(body[field]);
      if (v && !MODES.includes(v)) {
        const err = new Error(`mode must be one of: ${MODES.join(", ")}`);
        err.status = 400;
        throw err;
      }
      payload[field] = v;
    } else {
      payload[field] = toNullableString(body[field]);
    }
  }

  if (body.is_active !== undefined) {
    payload.is_active = body.is_active === true || body.is_active === "true";
  }

  return payload;
}

async function replaceHourDistributions(programmeId, rows, transaction) {
  await ProgrammeHourDistribution.destroy({ where: { programme_id: programmeId }, transaction });
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const payload = rows.map((row, i) => {
    const normalized = normalizeHourRow(row, programmeId, i);
    if (!normalized.nature) {
      const err = new Error("hour_distributions[].nature is required");
      err.status = 400;
      throw err;
    }
    return normalized;
  });

  return ProgrammeHourDistribution.bulkCreate(payload, { transaction });
}

async function replaceModules(programmeId, rows, transaction) {
  await ProgrammeModule.destroy({ where: { programme_id: programmeId }, transaction });
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const payload = rows.map((row, i) => {
    const normalized = normalizeModuleRow(row, programmeId, i);
    if (!normalized.code || !normalized.name) {
      const err = new Error("modules[].code and modules[].name are required");
      err.status = 400;
      throw err;
    }
    return normalized;
  });

  return ProgrammeModule.bulkCreate(payload, { transaction });
}

async function replaceFeeStructure(programmeId, rows, transaction) {
  await ProgrammeFee.destroy({ where: { programme_id: programmeId }, transaction });
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const seen = new Set();
  const payload = rows.map((row, i) => {
    const normalized = normalizeFeeRow(row, programmeId, i);
    const key = `${normalized.year_of_study}-${normalized.semester}`;
    if (seen.has(key)) {
      const err = new Error(
        `Duplicate fee for year ${normalized.year_of_study} semester ${normalized.semester}`
      );
      err.status = 400;
      throw err;
    }
    seen.add(key);
    return normalized;
  });

  return ProgrammeFee.bulkCreate(payload, { transaction });
}

async function replaceSubjectRequirements(programmeId, rows, transaction) {
  await ProgrammeSubjectRequirement.destroy({
    where: { programme_id: programmeId },
    transaction,
  });
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const seen = new Set();
  const payload = rows.map((row, i) => {
    const normalized = normalizeSubjectRequirementRow(row, programmeId, i);
    const key = normalized.subject.toLowerCase();
    if (seen.has(key)) {
      const err = new Error(`Duplicate subject requirement for "${normalized.subject}"`);
      err.status = 400;
      throw err;
    }
    seen.add(key);
    return normalized;
  });

  return ProgrammeSubjectRequirement.bulkCreate(payload, { transaction });
}

const feeInclude = {
  model: ProgrammeFee,
  as: "fee_structure",
  separate: true,
  order: [
    ["year_of_study", "ASC"],
    ["semester", "ASC"],
    ["sort_order", "ASC"],
  ],
};

const subjectRequirementInclude = {
  model: ProgrammeSubjectRequirement,
  as: "subject_requirements",
  separate: true,
  order: [
    ["sort_order", "ASC"],
    ["created_at", "ASC"],
  ],
};

const departmentsInclude = {
  model: Department,
  as: "departments",
  attributes: ["id", "name", "code", "is_active"],
  through: { attributes: [] },
  required: false,
};

function parseDepartmentIds(body) {
  const raw =
    body.department_ids !== undefined
      ? body.department_ids
      : body.department_id !== undefined
        ? body.department_id
        : undefined;
  if (raw === undefined) return undefined;

  let list = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      list = JSON.parse(trimmed);
    } catch {
      list = trimmed.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) list = [list];

  const ids = [
    ...new Set(
      list
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];
  return ids;
}

async function assertDepartmentsExist(departmentIds) {
  if (!departmentIds.length) return [];
  const rows = await Department.findAll({
    where: { id: departmentIds },
    attributes: ["id"],
  });
  if (rows.length !== departmentIds.length) {
    const err = new Error("One or more selected departments were not found");
    err.status = 400;
    throw err;
  }
  return departmentIds;
}

async function setProgrammeDepartments(programme, departmentIds, transaction) {
  if (typeof programme.setDepartments === "function") {
    await programme.setDepartments(departmentIds, { transaction });
    return;
  }
  await ProgrammeDepartment.destroy({
    where: { programme_id: programme.id },
    transaction,
  });
  if (!departmentIds.length) return;
  await ProgrammeDepartment.bulkCreate(
    departmentIds.map((department_id) => ({
      programme_id: programme.id,
      department_id,
    })),
    { transaction }
  );
}

async function loadProgrammeWithChildren(id) {
  return Programme.findByPk(id, {
    include: [
      departmentsInclude,
      {
        model: ProgrammeHourDistribution,
        as: "hour_distributions",
        separate: true,
        order: [
          ["sort_order", "ASC"],
          ["created_at", "ASC"],
        ],
      },
      {
        model: ProgrammeModule,
        as: "modules",
        separate: true,
        order: [
          ["sort_order", "ASC"],
          ["created_at", "ASC"],
        ],
      },
      feeInclude,
      subjectRequirementInclude,
    ],
  });
}

exports.listProgrammes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined) {
      where.is_active = String(req.query.is_active) === "true";
    }
    if (req.query.category) where.category = req.query.category;
    if (req.query.mode) where.mode = req.query.mode;

    const departmentFilter = String(req.query.department_id || "").trim();
    const include = [
      departmentsInclude,
      ...(String(req.query.include) === "children"
        ? [
            {
              model: ProgrammeHourDistribution,
              as: "hour_distributions",
              separate: true,
              order: [["sort_order", "ASC"]],
            },
            {
              model: ProgrammeModule,
              as: "modules",
              separate: true,
              order: [["sort_order", "ASC"]],
            },
            feeInclude,
            subjectRequirementInclude,
          ]
        : []),
    ];

    if (departmentFilter) {
      include[0] = {
        ...departmentsInclude,
        where: { id: departmentFilter },
        required: true,
      };
    }

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { award: { [Op.iLike]: `%${q}%` } },
        { category: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { minimum_kcse_grade: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await Programme.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      include,
    });

    return res.json({
      success: true,
      data: rows.map(serializeProgramme),
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

exports.getProgrammeById = async (req, res) => {
  try {
    const programme = await loadProgrammeWithChildren(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }
    return res.json({ success: true, data: serializeProgramme(programme) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Years / semesters available for student enrolment on a programme */
exports.getProgrammeEnrolmentOptions = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const [fees, modules] = await Promise.all([
      ProgrammeFee.findAll({
        where: { programme_id: programme.id },
        attributes: ["year_of_study", "semester"],
        raw: true,
      }),
      ProgrammeModule.findAll({
        where: { programme_id: programme.id },
        attributes: ["year_of_study", "semester"],
        raw: true,
      }),
    ]);

    const yearSet = new Set();
    const semSet = new Set();

    const duration = Number(programme.duration_years);
    if (Number.isFinite(duration) && duration >= 1) {
      for (let y = 1; y <= Math.min(Math.floor(duration), 10); y += 1) {
        yearSet.add(y);
      }
    }

    const addSemesterToken = (raw) => {
      if (raw === undefined || raw === null || String(raw).trim() === "") return;
      const s = String(raw).trim().toLowerCase();
      if (s.includes("/") || s.includes("&") || s.includes("+")) {
        if (/\b1\b/.test(s) || s.includes("sem 1") || s.includes("semester 1")) semSet.add(1);
        if (/\b2\b/.test(s) || s.includes("sem 2") || s.includes("semester 2")) semSet.add(2);
        return;
      }
      if (["1", "sem 1", "semester 1", "sem1", "s1"].includes(s)) {
        semSet.add(1);
        return;
      }
      if (["2", "sem 2", "semester 2", "sem2", "s2"].includes(s)) {
        semSet.add(2);
        return;
      }
      const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
      if (n === 1 || n === 2) semSet.add(n);
    };

    for (const row of [...fees, ...modules]) {
      const y = parseInt(row.year_of_study, 10);
      if (Number.isFinite(y) && y >= 1 && y <= 10) yearSet.add(y);
      addSemesterToken(row.semester);
    }

    if (
      programme.semester_1_weeks != null ||
      (programme.semester_1_period && String(programme.semester_1_period).trim())
    ) {
      semSet.add(1);
    }
    if (
      programme.semester_2_weeks != null ||
      (programme.semester_2_period && String(programme.semester_2_period).trim())
    ) {
      semSet.add(2);
    }

    if (yearSet.size === 0) yearSet.add(1);
    if (semSet.size === 0) {
      semSet.add(1);
      semSet.add(2);
    }

    const years = [...yearSet].sort((a, b) => a - b);
    const semesters = [...semSet].sort((a, b) => a - b);

    return res.json({
      success: true,
      data: {
        programme_id: programme.id,
        programme_name: programme.name,
        duration_years: programme.duration_years,
        years,
        semesters,
        semester_labels: {
          1: programme.semester_1_period || "Semester 1",
          2: programme.semester_2_period || "Semester 2",
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProgramme = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const payload = buildProgrammePayload(req.body);
    if (!payload.name) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "name is required" });
    }

    payload.image = req.file?.filename || req.body.image || null;
    if (payload.is_active === undefined) payload.is_active = true;

    const departmentIdsRaw = parseDepartmentIds(req.body);
    const departmentIds = await assertDepartmentsExist(departmentIdsRaw || []);
    if (!departmentIds.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Select at least one department for this programme",
      });
    }

    const programme = await Programme.create(payload, { transaction });
    await setProgrammeDepartments(programme, departmentIds, transaction);

    const hourRows = parseMaybeJson(req.body.hour_distributions);
    const moduleRows = parseMaybeJson(req.body.modules);
    const feeRows = parseMaybeJson(req.body.fee_structure);
    const subjectRows = parseMaybeJson(req.body.subject_requirements);

    if (hourRows !== undefined) {
      await replaceHourDistributions(programme.id, hourRows, transaction);
    }
    if (moduleRows !== undefined) {
      await replaceModules(programme.id, moduleRows, transaction);
    }
    if (feeRows !== undefined) {
      await replaceFeeStructure(programme.id, feeRows, transaction);
    }
    if (subjectRows !== undefined) {
      await replaceSubjectRequirements(programme.id, subjectRows, transaction);
    }

    await transaction.commit();

    const full = await loadProgrammeWithChildren(programme.id);

    await logFromRequest(req, {
      action: "create",
      resource_type: "programme",
      resource_id: programme.id,
      description: `Created programme "${programme.name}"`,
      new_values: serializeProgramme(full),
      status: "success",
    });

    return res.status(201).json({ success: true, data: serializeProgramme(full) });
  } catch (error) {
    await transaction.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateProgramme = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const programme = await Programme.findByPk(req.params.id, { transaction });
    if (!programme) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const oldFull = await loadProgrammeWithChildren(programme.id);
    const oldValues = serializeProgramme(oldFull);

    const patch = buildProgrammePayload(req.body, { partial: true });
    if (patch.name !== undefined && !patch.name) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "name cannot be empty" });
    }

    const departmentIdsRaw = parseDepartmentIds(req.body);
    let departmentIds;
    if (departmentIdsRaw !== undefined) {
      departmentIds = await assertDepartmentsExist(departmentIdsRaw);
      if (!departmentIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Select at least one department for this programme",
        });
      }
    }

    if (req.file?.filename) {
      if (programme.image) {
        const oldPath = path.join(__dirname, "..", "..", "uploads", "programmes", programme.image);
        fs.unlink(oldPath, () => {});
      }
      patch.image = req.file.filename;
    } else if (
      req.body.remove_image === true ||
      req.body.remove_image === "true" ||
      (req.body.image !== undefined && (req.body.image === "" || req.body.image === null))
    ) {
      if (programme.image) {
        const oldPath = path.join(__dirname, "..", "..", "uploads", "programmes", programme.image);
        fs.unlink(oldPath, () => {});
      }
      patch.image = null;
    } else if (req.body.image !== undefined) {
      patch.image = req.body.image || null;
    }

    await programme.update(patch, { transaction });

    if (departmentIds !== undefined) {
      await setProgrammeDepartments(programme, departmentIds, transaction);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "hour_distributions")) {
      const hourRows = parseMaybeJson(req.body.hour_distributions);
      if (hourRows === undefined && req.body.hour_distributions !== undefined) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "hour_distributions must be a JSON array",
        });
      }
      await replaceHourDistributions(programme.id, hourRows || [], transaction);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "modules")) {
      const moduleRows = parseMaybeJson(req.body.modules);
      if (moduleRows === undefined && req.body.modules !== undefined) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "modules must be a JSON array",
        });
      }
      await replaceModules(programme.id, moduleRows || [], transaction);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "fee_structure")) {
      const feeRows = parseMaybeJson(req.body.fee_structure);
      if (feeRows === undefined && req.body.fee_structure !== undefined) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "fee_structure must be a JSON array",
        });
      }
      await replaceFeeStructure(programme.id, feeRows || [], transaction);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "subject_requirements")) {
      const subjectRows = parseMaybeJson(req.body.subject_requirements);
      if (subjectRows === undefined && req.body.subject_requirements !== undefined) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "subject_requirements must be a JSON array",
        });
      }
      await replaceSubjectRequirements(programme.id, subjectRows || [], transaction);
    }

    await transaction.commit();

    const full = await loadProgrammeWithChildren(programme.id);

    await logFromRequest(req, {
      action: "update",
      resource_type: "programme",
      resource_id: programme.id,
      description: `Updated programme "${programme.name}"`,
      old_values: oldValues,
      new_values: serializeProgramme(full),
      status: "success",
    });

    return res.json({ success: true, data: serializeProgramme(full) });
  } catch (error) {
    await transaction.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteProgramme = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const programme = await loadProgrammeWithChildren(req.params.id);
    if (!programme) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const snapshot = serializeProgramme(programme);
    if (programme.image) {
      const imgPath = path.join(__dirname, "..", "..", "uploads", "programmes", programme.image);
      fs.unlink(imgPath, () => {});
    }

    await ProgrammeHourDistribution.destroy({
      where: { programme_id: programme.id },
      transaction,
    });
    await ProgrammeModule.destroy({
      where: { programme_id: programme.id },
      transaction,
    });
    await ProgrammeFee.destroy({
      where: { programme_id: programme.id },
      transaction,
    });
    await ProgrammeSubjectRequirement.destroy({
      where: { programme_id: programme.id },
      transaction,
    });
    await programme.destroy({ transaction });
    await transaction.commit();

    await logFromRequest(req, {
      action: "delete",
      resource_type: "programme",
      resource_id: snapshot.id,
      description: `Deleted programme "${snapshot.name}"`,
      old_values: snapshot,
      status: "success",
    });

    return res.json({ success: true, message: "Programme deleted" });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta(count, page, limit) {
  return {
    total: count,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(count / limit)),
  };
}

const programmeLiteInclude = {
  model: Programme,
  as: "programme",
  attributes: ["id", "name", "category", "award", "is_active"],
};

// --- Hour distributions ---

exports.listHourDistributions = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { count, rows } = await ProgrammeHourDistribution.findAndCountAll({
      where: { programme_id: req.params.id },
      order: [
        ["sort_order", "ASC"],
        ["created_at", "ASC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAllHourDistributions = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};
    if (req.query.programme_id) where.programme_id = req.query.programme_id;

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { nature: { [Op.iLike]: `%${q}%` } },
        { specific_nature: { [Op.iLike]: `%${q}%` } },
        { "$programme.name$": { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await ProgrammeHourDistribution.findAndCountAll({
      where,
      include: [programmeLiteInclude],
      order: [
        ["created_at", "DESC"],
        ["sort_order", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getHourDistributionById = async (req, res) => {
  try {
    const row = await ProgrammeHourDistribution.findByPk(req.params.hourId, {
      include: [programmeLiteInclude],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Hour distribution not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createHourDistributionGlobal = async (req, res) => {
  try {
    const programme_id = toNullableString(req.body.programme_id);
    if (!programme_id) {
      return res.status(400).json({ success: false, message: "programme_id is required" });
    }
    const programme = await Programme.findByPk(programme_id);
    if (!programme) {
      return res.status(400).json({ success: false, message: "Selected programme is invalid" });
    }

    const payload = normalizeHourRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    if (!payload.nature) {
      return res.status(400).json({ success: false, message: "nature is required" });
    }

    const row = await ProgrammeHourDistribution.create(payload);
    const full = await ProgrammeHourDistribution.findByPk(row.id, {
      include: [programmeLiteInclude],
    });
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateHourDistributionGlobal = async (req, res) => {
  try {
    const row = await ProgrammeHourDistribution.findByPk(req.params.hourId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Hour distribution not found" });
    }

    let programmeId = row.programme_id;
    if (req.body.programme_id !== undefined) {
      const nextProgrammeId = toNullableString(req.body.programme_id);
      if (!nextProgrammeId) {
        return res.status(400).json({ success: false, message: "programme_id cannot be empty" });
      }
      const programme = await Programme.findByPk(nextProgrammeId);
      if (!programme) {
        return res.status(400).json({ success: false, message: "Selected programme is invalid" });
      }
      programmeId = nextProgrammeId;
    }

    const next = normalizeHourRow(
      { ...row.get({ plain: true }), ...req.body },
      programmeId,
      toInt(req.body.sort_order, row.sort_order)
    );
    if (!next.nature) {
      return res.status(400).json({ success: false, message: "nature is required" });
    }

    await row.update(next);
    const full = await ProgrammeHourDistribution.findByPk(row.id, {
      include: [programmeLiteInclude],
    });
    return res.json({ success: true, data: full });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteHourDistributionGlobal = async (req, res) => {
  try {
    const row = await ProgrammeHourDistribution.findByPk(req.params.hourId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Hour distribution not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Hour distribution deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createHourDistribution = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const payload = normalizeHourRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    if (!payload.nature) {
      return res.status(400).json({ success: false, message: "nature is required" });
    }

    const row = await ProgrammeHourDistribution.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateHourDistribution = async (req, res) => {
  try {
    const row = await ProgrammeHourDistribution.findOne({
      where: { id: req.params.hourId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Hour distribution not found" });
    }

    const next = normalizeHourRow(
      { ...row.get({ plain: true }), ...req.body },
      row.programme_id,
      toInt(req.body.sort_order, row.sort_order)
    );
    if (!next.nature) {
      return res.status(400).json({ success: false, message: "nature is required" });
    }

    delete next.programme_id;
    await row.update(next);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteHourDistribution = async (req, res) => {
  try {
    const row = await ProgrammeHourDistribution.findOne({
      where: { id: req.params.hourId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Hour distribution not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Hour distribution deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Modules ---

exports.listModules = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const where = { programme_id: req.params.id };
    if (req.query.year_of_study !== undefined) {
      where.year_of_study = toNullableInt(req.query.year_of_study);
    }
    if (req.query.semester) where.semester = req.query.semester;

    const { count, rows } = await ProgrammeModule.findAndCountAll({
      where,
      order: [
        ["sort_order", "ASC"],
        ["created_at", "ASC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAllModules = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};
    if (req.query.programme_id) where.programme_id = req.query.programme_id;
    if (req.query.year_of_study !== undefined) {
      where.year_of_study = toNullableInt(req.query.year_of_study);
    }
    if (req.query.semester) where.semester = req.query.semester;

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${q}%` } },
        { name: { [Op.iLike]: `%${q}%` } },
        { semester: { [Op.iLike]: `%${q}%` } },
        { "$programme.name$": { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await ProgrammeModule.findAndCountAll({
      where,
      include: [programmeLiteInclude],
      order: [
        ["created_at", "DESC"],
        ["sort_order", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getModuleById = async (req, res) => {
  try {
    const row = await ProgrammeModule.findByPk(req.params.moduleId, {
      include: [programmeLiteInclude],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createModuleGlobal = async (req, res) => {
  try {
    const programme_id = toNullableString(req.body.programme_id);
    if (!programme_id) {
      return res.status(400).json({ success: false, message: "programme_id is required" });
    }
    const programme = await Programme.findByPk(programme_id);
    if (!programme) {
      return res.status(400).json({ success: false, message: "Selected programme is invalid" });
    }

    const payload = normalizeModuleRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    if (!payload.code || !payload.name) {
      return res.status(400).json({ success: false, message: "code and name are required" });
    }

    const row = await ProgrammeModule.create(payload);
    const full = await ProgrammeModule.findByPk(row.id, { include: [programmeLiteInclude] });
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateModuleGlobal = async (req, res) => {
  try {
    const row = await ProgrammeModule.findByPk(req.params.moduleId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }

    let programmeId = row.programme_id;
    if (req.body.programme_id !== undefined) {
      const nextProgrammeId = toNullableString(req.body.programme_id);
      if (!nextProgrammeId) {
        return res.status(400).json({ success: false, message: "programme_id cannot be empty" });
      }
      const programme = await Programme.findByPk(nextProgrammeId);
      if (!programme) {
        return res.status(400).json({ success: false, message: "Selected programme is invalid" });
      }
      programmeId = nextProgrammeId;
    }

    const next = normalizeModuleRow(
      { ...row.get({ plain: true }), ...req.body },
      programmeId,
      toInt(req.body.sort_order, row.sort_order)
    );
    if (!next.code || !next.name) {
      return res.status(400).json({ success: false, message: "code and name are required" });
    }

    await row.update(next);
    const full = await ProgrammeModule.findByPk(row.id, { include: [programmeLiteInclude] });
    return res.json({ success: true, data: full });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteModuleGlobal = async (req, res) => {
  try {
    const row = await ProgrammeModule.findByPk(req.params.moduleId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Module deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createModule = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const payload = normalizeModuleRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    if (!payload.code || !payload.name) {
      return res.status(400).json({ success: false, message: "code and name are required" });
    }

    const row = await ProgrammeModule.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateModule = async (req, res) => {
  try {
    const row = await ProgrammeModule.findOne({
      where: { id: req.params.moduleId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }

    const next = normalizeModuleRow(
      { ...row.get({ plain: true }), ...req.body },
      row.programme_id,
      toInt(req.body.sort_order, row.sort_order)
    );
    if (!next.code || !next.name) {
      return res.status(400).json({ success: false, message: "code and name are required" });
    }

    delete next.programme_id;
    await row.update(next);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteModule = async (req, res) => {
  try {
    const row = await ProgrammeModule.findOne({
      where: { id: req.params.moduleId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Module not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Module deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Fee structure ---

exports.listFees = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const where = { programme_id: req.params.id };
    if (req.query.year_of_study !== undefined) {
      where.year_of_study = toNullableInt(req.query.year_of_study);
    }
    if (req.query.semester !== undefined) {
      where.semester = toNullableInt(req.query.semester);
    }

    const { count, rows } = await ProgrammeFee.findAndCountAll({
      where,
      order: [
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
        ["sort_order", "ASC"],
      ],
      limit,
      offset,
    });

    const total_fee = rows.reduce((sum, fee) => sum + toMoney(fee.amount), 0);

    return res.json({
      success: true,
      data: rows,
      total_fee,
      currency: rows[0]?.currency || "KES",
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAllFees = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};
    if (req.query.programme_id) where.programme_id = req.query.programme_id;
    if (req.query.year_of_study !== undefined) {
      where.year_of_study = toNullableInt(req.query.year_of_study);
    }
    if (req.query.semester !== undefined) {
      where.semester = toNullableInt(req.query.semester);
    }

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { label: { [Op.iLike]: `%${q}%` } },
        { currency: { [Op.iLike]: `%${q}%` } },
        { "$programme.name$": { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await ProgrammeFee.findAndCountAll({
      where,
      include: [programmeLiteInclude],
      order: [
        ["created_at", "DESC"],
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFeeById = async (req, res) => {
  try {
    const row = await ProgrammeFee.findByPk(req.params.feeId, {
      include: [programmeLiteInclude],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Fee entry not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createFeeGlobal = async (req, res) => {
  try {
    const programme_id = toNullableString(req.body.programme_id);
    if (!programme_id) {
      return res.status(400).json({ success: false, message: "programme_id is required" });
    }
    const programme = await Programme.findByPk(programme_id);
    if (!programme) {
      return res.status(400).json({ success: false, message: "Selected programme is invalid" });
    }

    const payload = normalizeFeeRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    const row = await ProgrammeFee.create(payload);
    const full = await ProgrammeFee.findByPk(row.id, { include: [programmeLiteInclude] });
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A fee for this year and semester already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.updateFeeGlobal = async (req, res) => {
  try {
    const row = await ProgrammeFee.findByPk(req.params.feeId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Fee entry not found" });
    }

    let programmeId = row.programme_id;
    if (req.body.programme_id !== undefined) {
      const nextProgrammeId = toNullableString(req.body.programme_id);
      if (!nextProgrammeId) {
        return res.status(400).json({ success: false, message: "programme_id cannot be empty" });
      }
      const programme = await Programme.findByPk(nextProgrammeId);
      if (!programme) {
        return res.status(400).json({ success: false, message: "Selected programme is invalid" });
      }
      programmeId = nextProgrammeId;
    }

    const next = normalizeFeeRow(
      { ...row.get({ plain: true }), ...req.body },
      programmeId,
      toInt(req.body.sort_order, row.sort_order)
    );
    await row.update(next);
    const full = await ProgrammeFee.findByPk(row.id, { include: [programmeLiteInclude] });
    return res.json({ success: true, data: full });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A fee for this year and semester already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.deleteFeeGlobal = async (req, res) => {
  try {
    const row = await ProgrammeFee.findByPk(req.params.feeId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Fee entry not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Fee entry deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createFee = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const payload = normalizeFeeRow(req.body, programme.id, toInt(req.body.sort_order, 0));
    const row = await ProgrammeFee.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A fee for this year and semester already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.updateFee = async (req, res) => {
  try {
    const row = await ProgrammeFee.findOne({
      where: { id: req.params.feeId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Fee entry not found" });
    }

    const next = normalizeFeeRow(
      { ...row.get({ plain: true }), ...req.body },
      row.programme_id,
      toInt(req.body.sort_order, row.sort_order)
    );
    delete next.programme_id;
    await row.update(next);
    return res.json({ success: true, data: row });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A fee for this year and semester already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.deleteFee = async (req, res) => {
  try {
    const row = await ProgrammeFee.findOne({
      where: { id: req.params.feeId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Fee entry not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Fee entry deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Subject requirements ---

exports.listSubjectRequirements = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { count, rows } = await ProgrammeSubjectRequirement.findAndCountAll({
      where: { programme_id: req.params.id },
      order: [
        ["sort_order", "ASC"],
        ["created_at", "ASC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAllSubjectRequirements = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const where = {};
    if (req.query.programme_id) where.programme_id = req.query.programme_id;

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { subject: { [Op.iLike]: `%${q}%` } },
        { minimum_grade: { [Op.iLike]: `%${q}%` } },
        { "$programme.name$": { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await ProgrammeSubjectRequirement.findAndCountAll({
      where,
      include: [programmeLiteInclude],
      order: [
        ["created_at", "DESC"],
        ["sort_order", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: paginationMeta(count, page, limit),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSubjectRequirementById = async (req, res) => {
  try {
    const row = await ProgrammeSubjectRequirement.findByPk(req.params.requirementId, {
      include: [programmeLiteInclude],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Subject requirement not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSubjectRequirementGlobal = async (req, res) => {
  try {
    const programme_id = toNullableString(req.body.programme_id);
    if (!programme_id) {
      return res.status(400).json({ success: false, message: "programme_id is required" });
    }
    const programme = await Programme.findByPk(programme_id);
    if (!programme) {
      return res.status(400).json({ success: false, message: "Selected programme is invalid" });
    }

    const payload = normalizeSubjectRequirementRow(
      req.body,
      programme.id,
      toInt(req.body.sort_order, 0)
    );
    const row = await ProgrammeSubjectRequirement.create(payload);
    const full = await ProgrammeSubjectRequirement.findByPk(row.id, {
      include: [programmeLiteInclude],
    });
    return res.status(201).json({ success: true, data: full });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A requirement for this subject already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.updateSubjectRequirementGlobal = async (req, res) => {
  try {
    const row = await ProgrammeSubjectRequirement.findByPk(req.params.requirementId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Subject requirement not found" });
    }

    let programmeId = row.programme_id;
    if (req.body.programme_id !== undefined) {
      const nextProgrammeId = toNullableString(req.body.programme_id);
      if (!nextProgrammeId) {
        return res.status(400).json({ success: false, message: "programme_id cannot be empty" });
      }
      const programme = await Programme.findByPk(nextProgrammeId);
      if (!programme) {
        return res.status(400).json({ success: false, message: "Selected programme is invalid" });
      }
      programmeId = nextProgrammeId;
    }

    const next = normalizeSubjectRequirementRow(
      { ...row.get({ plain: true }), ...req.body },
      programmeId,
      toInt(req.body.sort_order, row.sort_order)
    );
    await row.update(next);
    const full = await ProgrammeSubjectRequirement.findByPk(row.id, {
      include: [programmeLiteInclude],
    });
    return res.json({ success: true, data: full });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A requirement for this subject already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.deleteSubjectRequirementGlobal = async (req, res) => {
  try {
    const row = await ProgrammeSubjectRequirement.findByPk(req.params.requirementId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Subject requirement not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Subject requirement deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSubjectRequirement = async (req, res) => {
  try {
    const programme = await Programme.findByPk(req.params.id);
    if (!programme) {
      return res.status(404).json({ success: false, message: "Programme not found" });
    }

    const payload = normalizeSubjectRequirementRow(
      req.body,
      programme.id,
      toInt(req.body.sort_order, 0)
    );
    const row = await ProgrammeSubjectRequirement.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A requirement for this subject already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.updateSubjectRequirement = async (req, res) => {
  try {
    const row = await ProgrammeSubjectRequirement.findOne({
      where: { id: req.params.requirementId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Subject requirement not found" });
    }

    const next = normalizeSubjectRequirementRow(
      { ...row.get({ plain: true }), ...req.body },
      row.programme_id,
      toInt(req.body.sort_order, row.sort_order)
    );
    delete next.programme_id;
    await row.update(next);
    return res.json({ success: true, data: row });
  } catch (error) {
    const status =
      error.status ||
      (error.name === "SequelizeUniqueConstraintError" ? 409 : 500);
    const message =
      error.name === "SequelizeUniqueConstraintError"
        ? "A requirement for this subject already exists"
        : error.message;
    return res.status(status).json({ success: false, message });
  }
};

exports.deleteSubjectRequirement = async (req, res) => {
  try {
    const row = await ProgrammeSubjectRequirement.findOne({
      where: { id: req.params.requirementId, programme_id: req.params.id },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Subject requirement not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Subject requirement deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
