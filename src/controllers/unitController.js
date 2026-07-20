const { Op } = require("sequelize");
const {
  Unit,
  StudentUnitRegistration,
  Department,
  Programme,
  ProgrammeDepartment,
  User,
} = require("../models");
const { logFromRequest } = require("../middleware/auditLogger");
const { buildLedger } = require("./accountingController");
const { evaluateFeatureAccess } = require("../services/accessPolicyService");

const UNIT_STATUSES = ["draft", "pending", "approved", "rejected"];

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function toInt(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function serializeUnit(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  if (plain.registrations_count == null && Array.isArray(plain.registrations)) {
    plain.registrations_count = plain.registrations.filter((r) => r.status === "registered").length;
  }
  return plain;
}

function unitIncludes() {
  return [
    { model: Department, as: "department", attributes: ["id", "name", "code"] },
    { model: Programme, as: "programme", attributes: ["id", "name", "category", "is_active"] },
    { model: User, as: "creator", attributes: ["id", "full_name", "email", "role"] },
    { model: User, as: "approver", attributes: ["id", "full_name", "email", "role"] },
  ];
}

/** Lean includes for paginated list views (faster). */
function unitListIncludes() {
  return [
    { model: Department, as: "department", attributes: ["id", "name", "code"] },
    { model: Programme, as: "programme", attributes: ["id", "name"] },
    { model: User, as: "creator", attributes: ["id", "full_name"] },
  ];
}

async function assertProgrammeLinkedToDepartment(programmeId, departmentId) {
  const link = await ProgrammeDepartment.findOne({
    where: { programme_id: programmeId, department_id: departmentId },
  });
  return Boolean(link);
}

function buildUnitPayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || body.code !== undefined) {
    const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : undefined;
    payload.code = code;
  }
  if (!partial || body.name !== undefined) {
    payload.name = body.name !== undefined ? String(body.name).trim() : undefined;
  }
  if (!partial || body.description !== undefined) {
    payload.description = toNullableString(body.description);
  }
  if (!partial || body.credits !== undefined) {
    payload.credits = toInt(body.credits, 0);
  }
  if (!partial || body.hours !== undefined) {
    payload.hours = toInt(body.hours, 0);
  }
  if (!partial || body.programme_id !== undefined) {
    payload.programme_id = body.programme_id || undefined;
  }
  if (!partial || body.year_of_study !== undefined) {
    payload.year_of_study = toInt(body.year_of_study);
  }
  if (!partial || body.semester !== undefined) {
    payload.semester = toInt(body.semester);
  }
  if (!partial || body.academic_year !== undefined) {
    payload.academic_year = body.academic_year !== undefined ? String(body.academic_year).trim() : undefined;
  }
  if (body.is_active !== undefined) {
    payload.is_active = toBool(body.is_active, true);
  }

  return payload;
}

function validateOfferingFields(payload, { partial = false } = {}) {
  if (!partial || payload.code !== undefined) {
    if (!payload.code) return "code is required";
  }
  if (!partial || payload.name !== undefined) {
    if (!payload.name) return "name is required";
  }
  if (!partial || payload.programme_id !== undefined) {
    if (!payload.programme_id) return "programme_id is required";
  }
  if (!partial || payload.year_of_study !== undefined) {
    if (!payload.year_of_study || payload.year_of_study < 1) return "year_of_study must be >= 1";
  }
  if (!partial || payload.semester !== undefined) {
    if (![1, 2].includes(payload.semester)) return "semester must be 1 or 2";
  }
  if (!partial || payload.academic_year !== undefined) {
    if (!payload.academic_year) return "academic_year is required (e.g. 2025/2026)";
  }
  return null;
}

function canEditUnit(user, unit) {
  if (!["draft", "rejected"].includes(unit.status)) return false;
  if (unit.created_by !== user.id) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") {
    return Boolean(user.department_id && unit.department_id === user.department_id);
  }
  return false;
}

function canSubmitUnit(user, unit) {
  return canEditUnit(user, unit);
}

exports.listUnits = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const andClauses = [];

    if (req.query.status) {
      const status = String(req.query.status).trim().toLowerCase();
      if (UNIT_STATUSES.includes(status)) andClauses.push({ status });
    } else if (req.user.role === "admin" && toBool(req.query.catalog, false)) {
      // All units: approved offerings + admin's own drafts/rejected (for submit)
      andClauses.push({
        [Op.or]: [
          { status: "approved" },
          {
            created_by: req.user.id,
            status: { [Op.in]: ["draft", "rejected"] },
          },
        ],
      });
    }

    // Own units only (staff/admin "My units" drafts & rejected)
    if (toBool(req.query.mine, false)) {
      andClauses.push({ created_by: req.user.id });
    }

    if (req.query.programme_id) andClauses.push({ programme_id: req.query.programme_id });
    if (req.query.department_id) andClauses.push({ department_id: req.query.department_id });
    if (req.query.academic_year) {
      andClauses.push({ academic_year: String(req.query.academic_year).trim() });
    }
    if (req.query.year_of_study) {
      andClauses.push({ year_of_study: toInt(req.query.year_of_study) });
    }
    if (req.query.semester) andClauses.push({ semester: toInt(req.query.semester) });
    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      andClauses.push({ is_active: toBool(req.query.is_active, true) });
    }

    // Staff only see their department's units unless admin
    if (req.user.role === "staff") {
      if (!req.user.department_id) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      andClauses.push({ department_id: req.user.department_id });
    }

    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      andClauses.push({
        [Op.or]: [
          { code: { [Op.iLike]: `%${q}%` } },
          { name: { [Op.iLike]: `%${q}%` } },
          { description: { [Op.iLike]: `%${q}%` } },
        ],
      });
    }

    const where = andClauses.length ? { [Op.and]: andClauses } : {};

    const { count, rows } = await Unit.findAndCountAll({
      where,
      order: [
        ["academic_year", "DESC"],
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
        ["code", "ASC"],
      ],
      limit,
      offset,
      distinct: true,
      include: unitListIncludes(),
    });

    return res.json({
      success: true,
      data: rows.map(serializeUnit),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) || 1 },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUnitById = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id, {
      include: [
        ...unitIncludes(),
        {
          model: StudentUnitRegistration,
          as: "registrations",
          required: false,
          include: [{ model: User, as: "student", attributes: ["id", "full_name", "email", "admission_number"] }],
        },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (
      req.user.role === "staff" &&
      req.user.department_id &&
      row.department_id !== req.user.department_id
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.json({ success: true, data: serializeUnit(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createUnit = async (req, res) => {
  try {
    const payload = buildUnitPayload(req.body);
    const validationError = validateOfferingFields(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    let departmentId = req.body.department_id || null;
    if (req.user.role === "staff") {
      if (!req.user.department_id) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      departmentId = req.user.department_id;
    }
    if (!departmentId) {
      return res.status(400).json({ success: false, message: "department_id is required" });
    }

    const linked = await assertProgrammeLinkedToDepartment(payload.programme_id, departmentId);
    if (!linked) {
      return res.status(400).json({
        success: false,
        message: "This programme is not linked to the selected department",
      });
    }

    const programme = await Programme.findByPk(payload.programme_id);
    if (!programme || programme.is_active === false) {
      return res.status(400).json({ success: false, message: "Programme not found or inactive" });
    }

    const row = await Unit.create({
      ...payload,
      department_id: departmentId,
      status: "draft",
      created_by: req.user.id,
      approved_by: null,
      approved_at: null,
      rejection_reason: null,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
    });

    await logFromRequest(req, {
      action: "create",
      resource_type: "unit",
      resource_id: row.id,
      description: `Created unit "${row.code} – ${row.name}"`,
    });

    const full = await Unit.findByPk(row.id, { include: unitIncludes() });
    return res.status(201).json({ success: true, data: serializeUnit(full) });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "A unit with this code already exists for that programme, year, semester and academic year",
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (!canEditUnit(req.user, row)) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can edit draft or rejected units",
      });
    }

    const payload = buildUnitPayload(req.body, { partial: true });
    const validationError = validateOfferingFields({ ...row.get({ plain: true }), ...payload }, { partial: true });
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const nextProgrammeId = payload.programme_id || row.programme_id;
    const departmentId = row.department_id;
    const linked = await assertProgrammeLinkedToDepartment(nextProgrammeId, departmentId);
    if (!linked) {
      return res.status(400).json({
        success: false,
        message: "This programme is not linked to the unit's department",
      });
    }

    // Editing a rejected unit returns it to draft
    if (row.status === "rejected") {
      payload.status = "draft";
      payload.rejection_reason = null;
      payload.approved_by = null;
      payload.approved_at = null;
    }

    await row.update(payload);

    await logFromRequest(req, {
      action: "update",
      resource_type: "unit",
      resource_id: row.id,
      description: `Updated unit "${row.code}"`,
    });

    const full = await Unit.findByPk(row.id, { include: unitIncludes() });
    return res.json({ success: true, data: serializeUnit(full) });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "A unit with this code already exists for that programme, year, semester and academic year",
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitUnit = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (!canSubmitUnit(req.user, row)) {
      return res.status(403).json({
        success: false,
        message: "Only the creator can submit this unit for approval",
      });
    }

    if (!["draft", "rejected"].includes(row.status)) {
      return res.status(400).json({
        success: false,
        message: "Only draft or rejected units can be submitted for approval",
      });
    }

    await row.update({
      status: "pending",
      rejection_reason: null,
      approved_by: null,
      approved_at: null,
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "unit",
      resource_id: row.id,
      description: `Submitted unit "${row.code}" for approval`,
    });

    const full = await Unit.findByPk(row.id, { include: unitIncludes() });
    return res.json({ success: true, data: serializeUnit(full), message: "Unit submitted for approval" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveUnit = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (row.status !== "pending") {
      return res.status(400).json({ success: false, message: "Only pending units can be approved" });
    }

    await row.update({
      status: "approved",
      approved_by: req.user.id,
      approved_at: new Date(),
      rejection_reason: null,
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "unit",
      resource_id: row.id,
      description: `Approved unit "${row.code}"`,
    });

    const full = await Unit.findByPk(row.id, { include: unitIncludes() });
    return res.json({ success: true, data: serializeUnit(full), message: "Unit approved" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectUnit = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (row.status !== "pending") {
      return res.status(400).json({ success: false, message: "Only pending units can be rejected" });
    }

    const reason = toNullableString(req.body.rejection_reason || req.body.reason);
    await row.update({
      status: "rejected",
      approved_by: req.user.id,
      approved_at: new Date(),
      rejection_reason: reason,
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "unit",
      resource_id: row.id,
      description: `Rejected unit "${row.code}"`,
    });

    const full = await Unit.findByPk(row.id, { include: unitIncludes() });
    return res.json({ success: true, data: serializeUnit(full), message: "Unit rejected" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const row = await Unit.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Unit not found" });

    if (req.user.role === "staff") {
      if (!canEditUnit(req.user, row) || row.status === "approved" || row.status === "pending") {
        return res.status(403).json({
          success: false,
          message: "Staff can only delete draft or rejected units they created in their department",
        });
      }
    }

    const regCount = await StudentUnitRegistration.count({
      where: { unit_id: row.id, status: "registered" },
    });
    if (regCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a unit that has student registrations",
      });
    }

    const code = row.code;
    await row.destroy();

    await logFromRequest(req, {
      action: "delete",
      resource_type: "unit",
      resource_id: req.params.id,
      description: `Deleted unit "${code}"`,
    });

    return res.json({ success: true, message: "Unit deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Staff/admin department roster:
 * programmes linked to the department → units in that dept → eligible students + registration status.
 */
exports.listDepartmentRoster = async (req, res) => {
  try {
    let departmentId = req.query.department_id || null;
    if (req.user.role === "staff") {
      if (!req.user.department_id) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      departmentId = req.user.department_id;
    }

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: "department_id is required",
      });
    }

    const department = await Department.findByPk(departmentId, {
      attributes: ["id", "name", "code"],
    });
    if (!department) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    const programmeLinks = await ProgrammeDepartment.findAll({
      where: { department_id: departmentId },
      attributes: ["programme_id"],
      raw: true,
    });
    const linkedIds = programmeLinks.map((r) => r.programme_id);
    if (!linkedIds.length) {
      return res.json({
        success: true,
        data: { programmes: [] },
        meta: { department: department.get({ plain: true }) },
      });
    }

    const programmes = await Programme.findAll({
      where: { is_active: true, id: { [Op.in]: linkedIds } },
      attributes: ["id", "name", "category", "duration_years"],
      order: [["name", "ASC"]],
    });

    const programmeIds = programmes.map((p) => p.id);
    if (!programmeIds.length) {
      return res.json({
        success: true,
        data: { programmes: [] },
        meta: { department: department.get({ plain: true }) },
      });
    }

    const unitWhere = {
      department_id: departmentId,
      programme_id: { [Op.in]: programmeIds },
      is_active: true,
    };
    if (req.query.status) {
      const status = String(req.query.status).trim().toLowerCase();
      if (UNIT_STATUSES.includes(status)) unitWhere.status = status;
    }
    if (req.query.programme_id) {
      unitWhere.programme_id = String(req.query.programme_id).trim();
    }

    const [units, students] = await Promise.all([
      Unit.findAll({
        where: unitWhere,
        attributes: [
          "id",
          "code",
          "name",
          "credits",
          "hours",
          "programme_id",
          "year_of_study",
          "semester",
          "academic_year",
          "status",
        ],
        order: [
          ["year_of_study", "ASC"],
          ["semester", "ASC"],
          ["code", "ASC"],
        ],
      }),
      User.findAll({
        where: {
          role: "student",
          is_active: true,
          programme_id: { [Op.in]: programmeIds },
        },
        attributes: [
          "id",
          "full_name",
          "email",
          "admission_number",
          "programme_id",
          "year_of_study",
          "semester",
        ],
        order: [
          ["year_of_study", "ASC"],
          ["semester", "ASC"],
          ["full_name", "ASC"],
        ],
      }),
    ]);

    const unitIds = units.map((u) => u.id);
    const registrations = unitIds.length
      ? await StudentUnitRegistration.findAll({
          where: {
            unit_id: { [Op.in]: unitIds },
            status: { [Op.in]: ["registered", "dropped"] },
          },
          attributes: ["id", "student_id", "unit_id", "status", "registered_at", "dropped_at"],
        })
      : [];

    const regByUnitStudent = new Map();
    for (const reg of registrations) {
      regByUnitStudent.set(`${reg.unit_id}:${reg.student_id}`, {
        registration_id: reg.id,
        registration_status: reg.status,
        registered_at: reg.registered_at,
        dropped_at: reg.dropped_at,
      });
    }

    const studentsByProgramme = {};
    for (const student of students) {
      const pid = student.programme_id;
      if (!studentsByProgramme[pid]) studentsByProgramme[pid] = [];
      studentsByProgramme[pid].push(student.get({ plain: true }));
    }

    const unitsByProgramme = {};
    for (const unit of units) {
      const pid = unit.programme_id;
      if (!unitsByProgramme[pid]) unitsByProgramme[pid] = [];
      unitsByProgramme[pid].push(unit);
    }

    const data = programmes.map((programme) => {
      const plainProgramme = programme.get({ plain: true });
      const programmeStudents = studentsByProgramme[programme.id] || [];
      const programmeUnits = unitsByProgramme[programme.id] || [];

      const unitRows = programmeUnits.map((unit) => {
        const plainUnit = unit.get({ plain: true });
        const eligible = programmeStudents.filter(
          (s) =>
            Number(s.year_of_study) === Number(unit.year_of_study) &&
            Number(s.semester) === Number(unit.semester)
        );

        const studentRows = eligible.map((student) => {
          const hit = regByUnitStudent.get(`${unit.id}:${student.id}`);
          return {
            ...student,
            registration_status: hit?.registration_status || "not_registered",
            registration_id: hit?.registration_id || null,
            registered_at: hit?.registered_at || null,
            dropped_at: hit?.dropped_at || null,
          };
        });

        const registeredCount = studentRows.filter((s) => s.registration_status === "registered").length;

        return {
          ...plainUnit,
          eligible_count: studentRows.length,
          registered_count: registeredCount,
          students: studentRows,
        };
      });

      return {
        ...plainProgramme,
        student_count: programmeStudents.length,
        unit_count: unitRows.length,
        students: programmeStudents,
        units: unitRows,
      };
    });

    return res.json({
      success: true,
      data: { programmes: data },
      meta: { department: department.get({ plain: true }) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Programmes linked to the current staff member's department (or all for admin). */
exports.listAssignableProgrammes = async (req, res) => {
  try {
    let departmentId = req.query.department_id || null;
    if (req.user.role === "staff") {
      if (!req.user.department_id) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      departmentId = req.user.department_id;
    }

    const include = departmentId
      ? [
          {
            model: Department,
            as: "departments",
            attributes: ["id", "name", "code"],
            where: { id: departmentId },
            through: { attributes: [] },
            required: true,
          },
        ]
      : [
          {
            model: Department,
            as: "departments",
            attributes: ["id", "name", "code"],
            through: { attributes: [] },
            required: false,
          },
        ];

    const rows = await Programme.findAll({
      where: { is_active: true },
      attributes: [
        "id",
        "name",
        "description",
        "category",
        "award",
        "mode",
        "duration",
        "duration_years",
        "semester_1_weeks",
        "semester_1_period",
        "semester_2_weeks",
        "semester_2_period",
        "image",
        "is_active",
      ],
      include,
      order: [["name", "ASC"]],
    });

    const programmeIds = rows.map((r) => r.id);
    const unitWhere = { programme_id: { [Op.in]: programmeIds.length ? programmeIds : ["00000000-0000-0000-0000-000000000000"] } };
    if (departmentId) unitWhere.department_id = departmentId;

    const unitRows = programmeIds.length
      ? await Unit.findAll({
          where: unitWhere,
          attributes: ["programme_id", "status"],
        })
      : [];

    const countsByProgramme = {};
    for (const u of unitRows) {
      const pid = u.programme_id;
      if (!countsByProgramme[pid]) {
        countsByProgramme[pid] = { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 };
      }
      countsByProgramme[pid].total += 1;
      if (countsByProgramme[pid][u.status] != null) countsByProgramme[pid][u.status] += 1;
    }

    const data = rows.map((row) => {
      const plain = row.get({ plain: true });
      plain.unit_counts = countsByProgramme[row.id] || {
        total: 0,
        draft: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      return plain;
    });

    let departmentMeta = null;
    if (departmentId) {
      departmentMeta = await Department.findByPk(departmentId, {
        attributes: ["id", "name", "code", "description", "is_active"],
      });
    }

    return res.json({
      success: true,
      data,
      meta: {
        department_id: departmentId || null,
        department: departmentMeta ? departmentMeta.get({ plain: true }) : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Student registration ───────────────────────────────────────────────────

exports.listAvailableUnitsForStudent = async (req, res) => {
  try {
    const student = req.user;
    if (student.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }
    if (!student.programme_id || !student.year_of_study || !student.semester) {
      return res.status(400).json({
        success: false,
        message: "Your enrolment (programme, year, semester) is incomplete",
      });
    }

    const academicYear = String(req.query.academic_year || "").trim();
    const where = {
      programme_id: student.programme_id,
      year_of_study: student.year_of_study,
      semester: student.semester,
      status: "approved",
      is_active: true,
    };
    if (academicYear) where.academic_year = academicYear;

    const rows = await Unit.findAll({
      where,
      include: unitIncludes(),
      order: [["code", "ASC"]],
    });

    const regs = await StudentUnitRegistration.findAll({
      where: { student_id: student.id, status: "registered" },
      attributes: ["unit_id"],
    });
    const registeredIds = new Set(regs.map((r) => r.unit_id));

    const data = rows.map((row) => {
      const plain = serializeUnit(row);
      plain.is_registered = registeredIds.has(row.id);
      return plain;
    });

    let enrollment_access = null;
    try {
      const ledger = await buildLedger(student.id);
      enrollment_access = await evaluateFeatureAccess("units", ledger.summary);
    } catch {
      enrollment_access = null;
    }

    return res.json({ success: true, data, meta: { enrollment_access } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMyRegistrations = async (req, res) => {
  try {
    const student = req.user;
    if (student.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const where = { student_id: student.id };
    if (req.query.status) {
      const status = String(req.query.status).trim().toLowerCase();
      if (["registered", "dropped"].includes(status)) where.status = status;
    } else {
      where.status = "registered";
    }

    const rows = await StudentUnitRegistration.findAll({
      where,
      include: [
        {
          model: Unit,
          as: "unit",
          include: unitIncludes(),
        },
      ],
      order: [["registered_at", "DESC"]],
    });

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.registerForUnit = async (req, res) => {
  try {
    const student = req.user;
    if (student.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }
    if (!student.programme_id || !student.year_of_study || !student.semester) {
      return res.status(400).json({
        success: false,
        message: "Your enrolment (programme, year, semester) is incomplete",
      });
    }

    const unit = await Unit.findByPk(req.params.id);
    if (!unit || !unit.is_active) {
      return res.status(404).json({ success: false, message: "Unit not found" });
    }
    if (unit.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "This unit is not approved for registration yet",
      });
    }
    if (
      unit.programme_id !== student.programme_id ||
      unit.year_of_study !== student.year_of_study ||
      unit.semester !== Number(student.semester)
    ) {
      return res.status(400).json({
        success: false,
        message: "This unit is not available for your programme, year, or semester",
      });
    }

    const ledger = await buildLedger(student.id);
    const enrollmentAccess = await evaluateFeatureAccess("units", ledger.summary);
    if (!enrollmentAccess.eligible) {
      return res.status(403).json({
        success: false,
        message: enrollmentAccess.message,
        data: { enrollment_access: enrollmentAccess },
      });
    }

    const existing = await StudentUnitRegistration.findOne({
      where: { student_id: student.id, unit_id: unit.id },
    });

    if (existing) {
      if (existing.status === "registered") {
        return res.status(409).json({ success: false, message: "You are already registered for this unit" });
      }
      await existing.update({
        status: "registered",
        registered_at: new Date(),
        dropped_at: null,
      });
      return res.json({ success: true, data: existing, message: "Re-registered for unit" });
    }

    const row = await StudentUnitRegistration.create({
      student_id: student.id,
      unit_id: unit.id,
      status: "registered",
      registered_at: new Date(),
    });

    await logFromRequest(req, {
      action: "create",
      resource_type: "student_unit_registration",
      resource_id: row.id,
      description: `Student registered for unit "${unit.code}"`,
    });

    return res.status(201).json({ success: true, data: row, message: "Registered for unit" });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Already registered for this unit" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.dropUnitRegistration = async (req, res) => {
  try {
    const student = req.user;
    if (student.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const row = await StudentUnitRegistration.findByPk(req.params.registrationId, {
      include: [{ model: Unit, as: "unit" }],
    });
    if (!row || row.student_id !== student.id) {
      return res.status(404).json({ success: false, message: "Registration not found" });
    }
    if (row.status !== "registered") {
      return res.status(400).json({ success: false, message: "Registration is already dropped" });
    }

    await row.update({ status: "dropped", dropped_at: new Date() });

    await logFromRequest(req, {
      action: "update",
      resource_type: "student_unit_registration",
      resource_id: row.id,
      description: `Student dropped unit "${row.unit?.code || row.unit_id}"`,
    });

    return res.json({ success: true, data: row, message: "Unit dropped" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
