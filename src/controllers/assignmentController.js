const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const {
  Assignment,
  Department,
  Programme,
  Unit,
  User,
  ProgrammeDepartment,
} = require("../models");
const {
  DEPARTMENT_SCOPED_ROLES,
  READ_ASSIGNMENT_ROLES,
  getActorDepartmentIds,
} = require("../middleware/auth");
const { logFromRequest } = require("../middleware/auditLogger");

const ASSIGNMENTS_UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "assignments");

function actorOwnsDepartment(user, departmentId) {
  if (!departmentId) return false;
  return getActorDepartmentIds(user).includes(String(departmentId));
}

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

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function toDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAdmin(user) {
  return user?.role === "admin";
}

function limitsToOwnDepartment(user) {
  return !isAdmin(user) && DEPARTMENT_SCOPED_ROLES.includes(user?.role);
}

function assignmentIncludes() {
  return [
    { model: Department, as: "department", attributes: ["id", "name", "code"] },
    { model: Programme, as: "programme", attributes: ["id", "name", "category"] },
    { model: Unit, as: "unit", attributes: ["id", "code", "name"] },
    {
      model: User,
      as: "creator",
      attributes: ["id", "full_name", "role", "email"],
    },
  ];
}

function unlinkAssignmentDocument(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const filePath = path.join(ASSIGNMENTS_UPLOAD_DIR, filename);
  fs.unlink(filePath, () => {});
}

function applyUploadedDocument(patch, file) {
  if (!file) return;
  patch.document_filename = file.filename;
  patch.document_original_name = file.originalname || file.filename;
  patch.document_mime_type = file.mimetype || null;
  patch.document_size = Number.isFinite(file.size) ? file.size : null;
}

function clearDocumentFields(patch) {
  patch.document_filename = null;
  patch.document_original_name = null;
  patch.document_mime_type = null;
  patch.document_size = null;
}

function serialize(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.has_document = Boolean(plain.document_filename);
  plain.document_url = plain.document_filename
    ? `/api/assignments/${plain.id}/document`
    : null;
  return plain;
}

function studentCanAccessAssignment(user, row) {
  if (user?.role !== "student") return false;
  if (!row?.is_published) return false;
  if (!user.programme_id || row.programme_id !== user.programme_id) return false;
  if (user.year_of_study == null || row.year_of_study !== user.year_of_study) return false;
  if (user.semester == null || row.semester !== user.semester) return false;
  return true;
}

function staffCanReadAssignment(user, row) {
  if (!user?.role || !READ_ASSIGNMENT_ROLES.includes(user.role)) return false;
  if (limitsToOwnDepartment(user) && !actorOwnsDepartment(user, row.department_id)) {
    return false;
  }
  return true;
}

async function assertProgrammeLinked(programmeId, departmentId) {
  if (!programmeId) return true;
  const link = await ProgrammeDepartment.findOne({
    where: { programme_id: programmeId, department_id: departmentId },
  });
  return Boolean(link);
}

async function resolveDepartmentId(actor, raw) {
  if (limitsToOwnDepartment(actor)) {
    const ids = getActorDepartmentIds(actor);
    if (!ids.length) {
      return { error: "Your account has no department assigned. Contact an admin." };
    }
    const requested = toNullableString(raw);
    if (requested) {
      if (!ids.includes(requested)) {
        return { error: "You can only use departments assigned to your account" };
      }
      return { department_id: requested };
    }
    return { department_id: ids[0] };
  }
  const department_id = toNullableString(raw);
  if (!department_id) return { error: "department_id is required" };
  const department = await Department.findByPk(department_id);
  if (!department) return { error: "Department not found" };
  return { department_id };
}

exports.listAssignments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (limitsToOwnDepartment(req.user)) {
      const departmentIds = getActorDepartmentIds(req.user);
      if (!departmentIds.length) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      where.department_id = { [Op.in]: departmentIds };
    } else if (req.query.department_id) {
      where.department_id = String(req.query.department_id);
    }

    if (req.query.programme_id) where.programme_id = String(req.query.programme_id);
    if (req.query.unit_id) where.unit_id = String(req.query.unit_id);
    if (req.query.academic_year) where.academic_year = String(req.query.academic_year).trim();
    if (req.query.year_of_study != null && req.query.year_of_study !== "") {
      where.year_of_study = toInt(req.query.year_of_study);
    }
    if (req.query.semester != null && req.query.semester !== "") {
      where.semester = toInt(req.query.semester);
    }
    if (req.query.is_published !== undefined && req.query.is_published !== "") {
      where.is_published = toBool(req.query.is_published);
    }

    const q = toNullableString(req.query.search || req.query.q);
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Assignment.findAndCountAll({
      where,
      include: assignmentIncludes(),
      order: [
        ["due_at", "ASC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serialize),
      meta: { page, limit, total: count, pages: Math.ceil(count / limit) || 1 },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Weekly / date-range summary for principal and leadership. */
exports.summaryAssignments = async (req, res) => {
  try {
    const where = {};
    if (limitsToOwnDepartment(req.user)) {
      const departmentIds = getActorDepartmentIds(req.user);
      if (!departmentIds.length) {
        return res.status(400).json({
          success: false,
          message: "Your account has no department assigned. Contact an admin.",
        });
      }
      where.department_id = { [Op.in]: departmentIds };
    } else if (req.query.department_id) {
      where.department_id = String(req.query.department_id);
    }

    const from = toDate(req.query.from) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = toDate(req.query.to) || new Date();
    where.created_at = { [Op.between]: [from, to] };

    const rows = await Assignment.findAll({
      where,
      include: assignmentIncludes(),
      order: [["created_at", "DESC"]],
    });

    const published = rows.filter((row) => row.is_published).length;
    const drafts = rows.length - published;
    const byDepartment = {};
    for (const row of rows) {
      const key = row.department_id || "none";
      if (!byDepartment[key]) {
        byDepartment[key] = {
          department_id: row.department_id,
          department_name: row.department?.name || "Unknown",
          total: 0,
          published: 0,
        };
      }
      byDepartment[key].total += 1;
      if (row.is_published) byDepartment[key].published += 1;
    }

    return res.json({
      success: true,
      data: {
        from,
        to,
        total: rows.length,
        published,
        drafts,
        by_department: Object.values(byDepartment),
        items: rows.map(serialize),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Student portal: published assignments for own programme / year / semester. */
exports.listMyAssignments = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is for students only",
      });
    }
    if (
      !req.user.programme_id ||
      req.user.year_of_study == null ||
      req.user.semester == null
    ) {
      return res.json({ success: true, data: [] });
    }

    const where = {
      is_published: true,
      programme_id: req.user.programme_id,
      year_of_study: req.user.year_of_study,
      semester: req.user.semester,
    };

    const rows = await Assignment.findAll({
      where,
      include: assignmentIncludes(),
      order: [
        ["due_at", "ASC"],
        ["published_at", "DESC"],
      ],
    });

    return res.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAssignmentById = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id, { include: assignmentIncludes() });
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found" });

    if (limitsToOwnDepartment(req.user) && !actorOwnsDepartment(req.user, row.department_id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.json({ success: true, data: serialize(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    const title = toNullableString(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const academic_year = toNullableString(req.body.academic_year);
    if (!academic_year) {
      return res.status(400).json({ success: false, message: "academic_year is required" });
    }

    const dept = await resolveDepartmentId(req.user, req.body.department_id);
    if (dept.error) {
      return res.status(400).json({ success: false, message: dept.error });
    }

    const programme_id = toNullableString(req.body.programme_id);
    if (!programme_id) {
      return res.status(400).json({
        success: false,
        message: "programme_id is required so students can be targeted by programme",
      });
    }
    const year_of_study = toInt(req.body.year_of_study);
    const semester = toInt(req.body.semester);
    if (year_of_study == null || year_of_study < 1) {
      return res.status(400).json({
        success: false,
        message: "year_of_study is required (from the programme duration)",
      });
    }
    if (semester == null || semester < 1) {
      return res.status(400).json({
        success: false,
        message: "semester is required",
      });
    }

    const unit_id = toNullableString(req.body.unit_id);
    const linked = await assertProgrammeLinked(programme_id, dept.department_id);
    if (!linked) {
      return res.status(400).json({
        success: false,
        message: "This programme is not linked to the selected department",
      });
    }

    if (unit_id) {
      const unit = await Unit.findByPk(unit_id);
      if (!unit) return res.status(400).json({ success: false, message: "Unit not found" });
      if (unit.department_id !== dept.department_id) {
        return res.status(400).json({
          success: false,
          message: "Unit does not belong to the selected department",
        });
      }
    }

    const is_published = toBool(req.body.is_published, false);
    const createPayload = {
      title,
      description: toNullableString(req.body.description),
      instructions: toNullableString(req.body.instructions),
      department_id: dept.department_id,
      programme_id,
      unit_id,
      academic_year,
      year_of_study,
      semester,
      due_at: toDate(req.body.due_at),
      is_published,
      published_at: is_published ? new Date() : null,
      created_by: req.user.id,
      updated_by: req.user.id,
    };
    applyUploadedDocument(createPayload, req.file);

    const row = await Assignment.create(createPayload);

    await logFromRequest(req, {
      action: "create",
      resource_type: "assignment",
      resource_id: row.id,
      description: `Created assignment "${title}"`,
    });

    const full = await Assignment.findByPk(row.id, { include: assignmentIncludes() });
    return res.status(201).json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found" });

    if (limitsToOwnDepartment(req.user) && !actorOwnsDepartment(req.user, row.department_id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const patch = {};
    if (req.body.title !== undefined) {
      const title = toNullableString(req.body.title);
      if (!title) return res.status(400).json({ success: false, message: "title is required" });
      patch.title = title;
    }
    if (req.body.description !== undefined) {
      patch.description = toNullableString(req.body.description);
    }
    if (req.body.instructions !== undefined) {
      patch.instructions = toNullableString(req.body.instructions);
    }
    if (req.body.academic_year !== undefined) {
      const academic_year = toNullableString(req.body.academic_year);
      if (!academic_year) {
        return res.status(400).json({ success: false, message: "academic_year is required" });
      }
      patch.academic_year = academic_year;
    }
    if (req.body.due_at !== undefined) {
      patch.due_at = toDate(req.body.due_at);
    }

    let department_id = row.department_id;
    if (req.body.department_id !== undefined) {
      const dept = await resolveDepartmentId(req.user, req.body.department_id);
      if (dept.error) {
        return res.status(400).json({ success: false, message: dept.error });
      }
      department_id = dept.department_id;
      patch.department_id = department_id;
    }

    if (req.body.programme_id !== undefined) {
      const programme_id = toNullableString(req.body.programme_id);
      if (!programme_id) {
        return res.status(400).json({
          success: false,
          message: "programme_id is required so students can be targeted by programme",
        });
      }
      const linked = await assertProgrammeLinked(programme_id, department_id);
      if (!linked) {
        return res.status(400).json({
          success: false,
          message: "This programme is not linked to the selected department",
        });
      }
      patch.programme_id = programme_id;
    }

    if (req.body.year_of_study !== undefined) {
      const year_of_study = toInt(req.body.year_of_study);
      if (year_of_study == null || year_of_study < 1) {
        return res.status(400).json({
          success: false,
          message: "year_of_study is required (from the programme duration)",
        });
      }
      patch.year_of_study = year_of_study;
    }

    if (req.body.semester !== undefined) {
      const semester = toInt(req.body.semester);
      if (semester == null || semester < 1) {
        return res.status(400).json({
          success: false,
          message: "semester is required",
        });
      }
      patch.semester = semester;
    }

    if (req.body.unit_id !== undefined) {
      const unit_id = toNullableString(req.body.unit_id);
      if (unit_id) {
        const unit = await Unit.findByPk(unit_id);
        if (!unit) return res.status(400).json({ success: false, message: "Unit not found" });
        if (unit.department_id !== department_id) {
          return res.status(400).json({
            success: false,
            message: "Unit does not belong to the selected department",
          });
        }
      }
      patch.unit_id = unit_id;
    }

    if (req.body.is_published !== undefined) {
      const is_published = toBool(req.body.is_published, row.is_published);
      patch.is_published = is_published;
      if (is_published && !row.is_published) patch.published_at = new Date();
      if (!is_published) patch.published_at = null;
    }

    const nextProgrammeId =
      patch.programme_id !== undefined ? patch.programme_id : row.programme_id;
    const nextYear =
      patch.year_of_study !== undefined ? patch.year_of_study : row.year_of_study;
    const nextSemester = patch.semester !== undefined ? patch.semester : row.semester;
    const willPublish =
      patch.is_published !== undefined ? patch.is_published : row.is_published;
    if (willPublish && (!nextProgrammeId || nextYear == null || nextSemester == null)) {
      return res.status(400).json({
        success: false,
        message:
          "Published assignments need programme, year of study, and semester so the right students see them",
      });
    }

    const removeDocument = toBool(req.body.remove_document, false);
    const previousFilename = row.document_filename;
    if (req.file) {
      applyUploadedDocument(patch, req.file);
    } else if (removeDocument) {
      clearDocumentFields(patch);
    }

    patch.updated_by = req.user.id;
    await row.update(patch);

    if ((req.file || removeDocument) && previousFilename && previousFilename !== row.document_filename) {
      unlinkAssignmentDocument(previousFilename);
    }

    await logFromRequest(req, {
      action: "update",
      resource_type: "assignment",
      resource_id: row.id,
      description: `Updated assignment "${row.title}"`,
    });

    const full = await Assignment.findByPk(row.id, { include: assignmentIncludes() });
    return res.json({ success: true, data: serialize(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Assignment not found" });

    if (limitsToOwnDepartment(req.user) && !actorOwnsDepartment(req.user, row.department_id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const title = row.title;
    const filename = row.document_filename;
    await row.destroy();
    unlinkAssignmentDocument(filename);

    await logFromRequest(req, {
      action: "delete",
      resource_type: "assignment",
      resource_id: req.params.id,
      description: `Deleted assignment "${title}"`,
    });

    return res.json({ success: true, message: "Assignment deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Staff (read roles) or matching students download the assignment document. */
exports.serveAssignmentDocument = async (req, res) => {
  try {
    const row = await Assignment.findByPk(req.params.id);
    if (!row || !row.document_filename) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const allowed =
      studentCanAccessAssignment(req.user, row) || staffCanReadAssignment(req.user, row);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (/^https?:\/\//i.test(row.document_filename)) {
      return res.redirect(row.document_filename);
    }

    const filePath = path.join(ASSIGNMENTS_UPLOAD_DIR, row.document_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: "File missing on server" });
    }

    const downloadName = row.document_original_name || row.document_filename;
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(downloadName).replace(/"/g, "")}"`
    );
    if (row.document_mime_type) {
      res.type(row.document_mime_type);
    } else if (/\.pdf$/i.test(row.document_filename || "")) {
      res.type("application/pdf");
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
