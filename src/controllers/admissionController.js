const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { Op, fn, col, where: sqlWhere } = require("sequelize");
const { AdmissionApplication, Programme, User } = require("../models");
const { logFromRequest } = require("../middleware/auditLogger");
const { meetsMinimumKcseGrade, parseKcseGrade } = require("../utils/kcseGrade");

const STATUSES = ["pending", "under_review", "accepted", "rejected"];
const DOCUMENT_FIELDS = [
  "kcse_certificate",
  "result_slip",
  "birth_certificate",
  "id_document",
];
const DEFAULT_STUDENT_PASSWORD = "123456";

function documentUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename)) return filename;
  return `/uploads/admissions/${filename}`;
}

function normalizeStatusNotes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function serializeApplication(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.kcse_certificate_url = documentUrl(plain.kcse_certificate);
  plain.result_slip_url = documentUrl(plain.result_slip);
  plain.birth_certificate_url = documentUrl(plain.birth_certificate);
  plain.id_document_url = documentUrl(plain.id_document);
  plain.status_notes = normalizeStatusNotes(plain.status_notes);
  return plain;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAdmissionNumber(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function sanitizeCreatedUser(user) {
  const plain = user.get ? user.get({ plain: true }) : { ...user };
  delete plain.password_hash;
  return plain;
}

/**
 * When an application is accepted, create a Year 1 / Semester 1 student account.
 * Admission number must be provided by the admin (not auto-generated from national ID).
 * Idempotent if a student with the same email already exists.
 */
async function ensureStudentFromAcceptedApplication(application, admissionNumberRaw) {
  const email = normalizeEmail(application.email);
  const full_name = toNullableString(application.full_name);
  const phone = toNullableString(application.phone);
  const programme_id = application.programme_id;
  const admission_number = normalizeAdmissionNumber(admissionNumberRaw || "");

  if (!email || !full_name || !programme_id) {
    return {
      created: false,
      reason: "missing_fields",
      message: "Cannot create student: email, full name, and programme are required",
    };
  }

  if (!admission_number) {
    return {
      created: false,
      reason: "missing_admission_number",
      message: "Admission number is required when accepting an application",
    };
  }

  const programme = await Programme.findByPk(programme_id);
  if (!programme) {
    return {
      created: false,
      reason: "invalid_programme",
      message: "Cannot create student: programme not found",
    };
  }

  const existingByEmail = await User.findOne({
    where: sqlWhere(fn("LOWER", col("email")), email),
  });
  if (existingByEmail) {
    if (existingByEmail.role === "student") {
      const patch = {};
      if (!existingByEmail.programme_id) patch.programme_id = programme_id;
      if (existingByEmail.year_of_study == null) patch.year_of_study = 1;
      if (existingByEmail.semester == null) patch.semester = 1;
      if (!existingByEmail.admission_number) patch.admission_number = admission_number;
      if (Object.keys(patch).length) await existingByEmail.update(patch);
      return {
        created: false,
        reason: "already_exists",
        message: "A student account with this email already exists",
        user: sanitizeCreatedUser(existingByEmail),
        default_password: null,
      };
    }
    return {
      created: false,
      reason: "email_in_use",
      message: `Email is already used by a ${existingByEmail.role} account`,
    };
  }

  const admissionTaken = await User.findOne({
    where: sqlWhere(fn("UPPER", col("admission_number")), admission_number),
  });
  if (admissionTaken) {
    return {
      created: false,
      reason: "admission_taken",
      message: `Admission number "${admission_number}" is already in use`,
    };
  }

  const password_hash = await bcrypt.hash(DEFAULT_STUDENT_PASSWORD, 10);
  const user = await User.create({
    email,
    password_hash,
    role: "student",
    full_name,
    phone: phone || null,
    admission_number,
    programme_id,
    year_of_study: 1,
    semester: 1,
    position: null,
    is_public: false,
    is_active: true,
    profile_image: null,
  });

  return {
    created: true,
    reason: "created",
    message: "Student account created (Year 1, Semester 1)",
    user: sanitizeCreatedUser(user),
    default_password: DEFAULT_STUDENT_PASSWORD,
  };
}

function unlinkIfExists(filename) {
  if (!filename) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "admissions", filename);
  fs.unlink(filePath, () => {});
}

function getUploadedFilename(req, field) {
  const files = req.files;
  if (!files) return undefined;
  if (Array.isArray(files)) {
    const hit = files.find((f) => f.fieldname === field);
    return hit?.filename;
  }
  const arr = files[field];
  return Array.isArray(arr) && arr[0] ? arr[0].filename : undefined;
}

function actorFromReq(req) {
  const u = req.user;
  if (!u) return { changed_by_id: null, changed_by_name: "System" };
  return {
    changed_by_id: u.id || null,
    changed_by_name: u.full_name || u.email || "Admin",
  };
}

function makeStatusNote({ status, note, req }) {
  const actor = actorFromReq(req);
  return {
    status,
    note: toNullableString(note) || "",
    changed_at: new Date().toISOString(),
    changed_by_id: actor.changed_by_id,
    changed_by_name: actor.changed_by_name,
  };
}

function validateRequired(body) {
  const full_name = toNullableString(body.full_name || body.name);
  const phone = toNullableString(body.phone);
  const email = toNullableString(body.email);
  const national_id = toNullableString(body.national_id);
  const kcse_grade = toNullableString(body.kcse_grade);
  const programme_id = toNullableString(body.programme_id);

  const missing = [];
  if (!full_name) missing.push("full_name");
  if (!phone) missing.push("phone");
  if (!email) missing.push("email");
  if (!national_id) missing.push("national_id");
  if (!kcse_grade) missing.push("kcse_grade");
  if (!programme_id) missing.push("programme_id");

  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }

  return {
    full_name,
    phone,
    email,
    national_id,
    kcse_grade,
    programme_id,
    address: toNullableString(body.address),
  };
}

const programmeListInclude = {
  model: Programme,
  as: "programme",
  attributes: ["id", "name", "category", "award", "minimum_kcse_grade"],
};

exports.listApplications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.status) where.status = req.query.status;
    if (req.query.programme_id) where.programme_id = req.query.programme_id;
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.or] = [
          { full_name: { [Op.iLike]: `%${q}%` } },
          { email: { [Op.iLike]: `%${q}%` } },
          { phone: { [Op.iLike]: `%${q}%` } },
          { national_id: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await AdmissionApplication.findAndCountAll({
      where,
      include: [programmeListInclude],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map(serializeApplication),
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

exports.getApplicationById = async (req, res) => {
  try {
    const application = await AdmissionApplication.findByPk(req.params.id, {
      include: [
        {
          model: Programme,
          as: "programme",
          attributes: [
            "id",
            "name",
            "category",
            "award",
            "minimum_kcse_grade",
            "duration_years",
            "mode",
          ],
        },
      ],
    });
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    return res.json({ success: true, data: serializeApplication(application) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createApplication = async (req, res) => {
  try {
    const payload = validateRequired(req.body);

    const programme = await Programme.findByPk(payload.programme_id);
    if (!programme || programme.is_active === false) {
      return res.status(400).json({
        success: false,
        message: "Selected programme is invalid or inactive",
      });
    }

    const gradeCheck = meetsMinimumKcseGrade(payload.kcse_grade, programme.minimum_kcse_grade);
    if (!gradeCheck.ok) {
      return res.status(400).json({
        success: false,
        message: gradeCheck.message,
        code: "KCSE_GRADE_TOO_LOW",
        data: {
          applicant_grade: gradeCheck.applicant,
          minimum_grade: gradeCheck.minimum || parseKcseGrade(programme.minimum_kcse_grade),
          programme: programme.name,
        },
      });
    }
    // Store canonical grade when parseable
    if (gradeCheck.applicant) payload.kcse_grade = gradeCheck.applicant;

    for (const field of DOCUMENT_FIELDS) {
      const uploaded = getUploadedFilename(req, field);
      if (uploaded) payload[field] = uploaded;
      else if (req.body[field]) payload[field] = toNullableString(req.body[field]);
    }

    const initialNote = makeStatusNote({
      status: "pending",
      note: "Application submitted",
      req,
    });

    const application = await AdmissionApplication.create({
      ...payload,
      status: "pending",
      status_notes: [initialNote],
    });

    const full = await AdmissionApplication.findByPk(application.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });

    await logFromRequest(req, {
      action: "create",
      resource_type: "admission_application",
      resource_id: application.id,
      description: `Admission application from "${application.full_name}"`,
      new_values: serializeApplication(full),
      status: "success",
    });

    return res.status(201).json({ success: true, data: serializeApplication(full) });
  } catch (error) {
    for (const field of DOCUMENT_FIELDS) {
      const uploaded = getUploadedFilename(req, field);
      if (uploaded) unlinkIfExists(uploaded);
    }
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

/** Admin: change status + append note to status_notes history */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const application = await AdmissionApplication.findByPk(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    const status = toNullableString(req.body.status);
    const note = toNullableString(req.body.note ?? req.body.notes);

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${STATUSES.join(", ")}`,
      });
    }
    if (!note) {
      return res.status(400).json({
        success: false,
        message: "A note is required when changing status",
      });
    }

    const previousStatus = application.status;
    const becomingAccepted = status === "accepted" && previousStatus !== "accepted";
    const admission_number = toNullableString(req.body.admission_number);

    if (becomingAccepted && !admission_number) {
      return res.status(400).json({
        success: false,
        message: "Admission number is required when accepting an application",
        code: "ADMISSION_NUMBER_REQUIRED",
      });
    }

    // Pre-check student creation so we don't accept if admission number is taken
    let studentAccount = null;
    if (becomingAccepted) {
      studentAccount = await ensureStudentFromAcceptedApplication(application, admission_number);
      if (
        !studentAccount.created &&
        studentAccount.reason !== "already_exists"
      ) {
        return res.status(400).json({
          success: false,
          message: studentAccount.message || "Could not create student account",
          code: studentAccount.reason,
          student_account: studentAccount,
        });
      }
    }

    const oldValues = serializeApplication(application);
    const history = normalizeStatusNotes(application.status_notes);
    history.push(makeStatusNote({ status, note, req }));

    if (studentAccount?.created) {
      history.push(
        makeStatusNote({
          status,
          note: `Student account created (${studentAccount.user?.email}, admission ${studentAccount.user?.admission_number}, Year 1 Sem 1). Default password: ${DEFAULT_STUDENT_PASSWORD}`,
          req,
        })
      );
    } else if (studentAccount?.reason === "already_exists") {
      history.push(
        makeStatusNote({
          status,
          note: `Student account already existed for ${studentAccount.user?.email || application.email}`,
          req,
        })
      );
    }

    await application.update({
      status,
      status_notes: history,
    });

    const full = await AdmissionApplication.findByPk(application.id, {
      include: [programmeListInclude],
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "admission_application",
      resource_id: application.id,
      description: `Status → ${status} for "${application.full_name}"`,
      old_values: oldValues,
      new_values: serializeApplication(full),
      status: "success",
      metadata: studentAccount
        ? {
            student_created: Boolean(studentAccount.created),
            student_reason: studentAccount.reason,
          }
        : undefined,
    });

    return res.json({
      success: true,
      data: serializeApplication(full),
      student_account: studentAccount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateApplication = async (req, res) => {
  try {
    const application = await AdmissionApplication.findByPk(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    const oldValues = serializeApplication(application);
    const patch = {};

    if (req.body.full_name !== undefined || req.body.name !== undefined) {
      const full_name = toNullableString(req.body.full_name || req.body.name);
      if (!full_name) {
        return res.status(400).json({ success: false, message: "full_name cannot be empty" });
      }
      patch.full_name = full_name;
    }
    if (req.body.phone !== undefined) {
      const phone = toNullableString(req.body.phone);
      if (!phone) return res.status(400).json({ success: false, message: "phone cannot be empty" });
      patch.phone = phone;
    }
    if (req.body.email !== undefined) {
      const email = toNullableString(req.body.email);
      if (!email) return res.status(400).json({ success: false, message: "email cannot be empty" });
      patch.email = email;
    }
    if (req.body.national_id !== undefined) {
      const national_id = toNullableString(req.body.national_id);
      if (!national_id) {
        return res.status(400).json({ success: false, message: "national_id cannot be empty" });
      }
      patch.national_id = national_id;
    }
    if (req.body.kcse_grade !== undefined) {
      const kcse_grade = toNullableString(req.body.kcse_grade);
      if (!kcse_grade) {
        return res.status(400).json({ success: false, message: "kcse_grade cannot be empty" });
      }
      patch.kcse_grade = kcse_grade;
    }
    if (req.body.address !== undefined) patch.address = toNullableString(req.body.address);
    if (req.body.admin_notes !== undefined) {
      patch.admin_notes = toNullableString(req.body.admin_notes);
    }
    if (req.body.status !== undefined) {
      const status = toNullableString(req.body.status);
      if (!STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${STATUSES.join(", ")}`,
        });
      }
      if (status !== application.status) {
        const note = toNullableString(req.body.note ?? req.body.notes ?? req.body.status_note);
        if (!note) {
          return res.status(400).json({
            success: false,
            message: "A note is required when changing status",
          });
        }
        const history = normalizeStatusNotes(application.status_notes);
        history.push(makeStatusNote({ status, note, req }));
        patch.status = status;
        patch.status_notes = history;
      }
    }
    if (req.body.programme_id !== undefined) {
      const programme_id = toNullableString(req.body.programme_id);
      if (!programme_id) {
        return res.status(400).json({ success: false, message: "programme_id cannot be empty" });
      }
      const programme = await Programme.findByPk(programme_id);
      if (!programme) {
        return res.status(400).json({ success: false, message: "Selected programme is invalid" });
      }
      patch.programme_id = programme_id;
    }

    for (const field of DOCUMENT_FIELDS) {
      const uploaded = getUploadedFilename(req, field);
      if (uploaded) {
        unlinkIfExists(application[field]);
        patch[field] = uploaded;
      } else if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const next = toNullableString(req.body[field]);
        if (next !== application[field]) unlinkIfExists(application[field]);
        patch[field] = next;
      }
    }

    const previousStatus = application.status;
    const becomingAccepted =
      patch.status === "accepted" && previousStatus !== "accepted";
    const admission_number = toNullableString(req.body.admission_number);

    if (becomingAccepted && !admission_number) {
      return res.status(400).json({
        success: false,
        message: "Admission number is required when accepting an application",
        code: "ADMISSION_NUMBER_REQUIRED",
      });
    }

    let studentAccount = null;
    if (becomingAccepted) {
      studentAccount = await ensureStudentFromAcceptedApplication(application, admission_number);
      if (!studentAccount.created && studentAccount.reason !== "already_exists") {
        return res.status(400).json({
          success: false,
          message: studentAccount.message || "Could not create student account",
          code: studentAccount.reason,
          student_account: studentAccount,
        });
      }
      const historyNotes = patch.status_notes || normalizeStatusNotes(application.status_notes);
      if (studentAccount.created) {
        historyNotes.push(
          makeStatusNote({
            status: "accepted",
            note: `Student account created (${studentAccount.user?.email}, admission ${studentAccount.user?.admission_number}, Year 1 Sem 1). Default password: ${DEFAULT_STUDENT_PASSWORD}`,
            req,
          })
        );
      } else if (studentAccount.reason === "already_exists") {
        historyNotes.push(
          makeStatusNote({
            status: "accepted",
            note: `Student account already existed for ${studentAccount.user?.email || application.email}`,
            req,
          })
        );
      }
      patch.status_notes = historyNotes;
    }

    await application.update(patch);

    const full = await AdmissionApplication.findByPk(application.id, {
      include: [programmeListInclude],
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "admission_application",
      resource_id: application.id,
      description: `Updated admission application "${application.full_name}"`,
      old_values: oldValues,
      new_values: serializeApplication(full),
      status: "success",
    });

    return res.json({
      success: true,
      data: serializeApplication(full),
      student_account: studentAccount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteApplication = async (req, res) => {
  try {
    const application = await AdmissionApplication.findByPk(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    const snapshot = serializeApplication(application);
    for (const field of DOCUMENT_FIELDS) {
      unlinkIfExists(application[field]);
    }
    await application.destroy();

    await logFromRequest(req, {
      action: "delete",
      resource_type: "admission_application",
      resource_id: snapshot.id,
      description: `Deleted admission application "${snapshot.full_name}"`,
      old_values: snapshot,
      status: "success",
    });

    return res.json({ success: true, message: "Application deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.STATUSES = STATUSES;
