const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const { QueryTypes, Op, fn, col, where: sqlWhere } = require("sequelize");
const { User, Programme, Department, sequelize } = require("../models");
const config = require("../config/config");
const { logFromRequest, getIpAddress } = require("../middleware/auditLogger");
const {
  ADMIN_ROLE,
  STAFF_ROLES,
  ADMIN_PORTAL_API_ROLES,
  ADMIN_PORTAL_LOGIN_BLOCKED_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  ALL_USER_ROLES,
} = require("../middleware/auth");

async function auditLogin(req, { user = null, status = "success", description }) {
  await logFromRequest(req, {
    user_id: user?.id || null,
    action: "login",
    resource_type: "user",
    resource_id: user?.id || null,
    description: description || "User login",
    status,
    metadata: {
      portal: req.body?.portal || null,
      ip: getIpAddress(req),
    },
  });
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeAdmissionNumber(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function profileImagePath(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) {
    return filename;
  }
  return `/uploads/profiles/${filename}`;
}

function deleteProfileFile(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const name = String(filename).replace(/^\/uploads\/profiles\//, "");
  const full = path.join(__dirname, "..", "..", "uploads", "profiles", name);
  fs.unlink(full, () => {});
}

function duplicateUserWhere(emailRaw, admissionNumberRaw) {
  const conditions = [sqlWhere(fn("LOWER", col("email")), normalizeEmail(emailRaw))];
  const admission = normalizeAdmissionNumber(admissionNumberRaw);
  if (admission) {
    conditions.push(sqlWhere(fn("UPPER", col("admission_number")), admission));
  }
  return { [Op.or]: conditions };
}

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (role === "students") return "student";
  return role;
}

function studentAdmissionRequired(role, admissionNumber) {
  return role === "student" && !normalizeAdmissionNumber(admissionNumber);
}

const DEFAULT_STUDENT_PASSWORD = "123456";

const STUDENT_IMPORT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "full_name", label: "Full name", required: true },
  { key: "admission_number", label: "Admission number", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "password", label: "Password", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "year_of_study", label: "Year of study", required: false },
  { key: "semester", label: "Semester", required: false },
];

const programmeInclude = {
  model: Programme,
  as: "programme",
  attributes: ["id", "name", "award", "category", "mode"],
  required: false,
};

const departmentInclude = {
  model: Department,
  as: "department",
  attributes: ["id", "name", "code", "is_active"],
  required: false,
};

function parseYearOfStudy(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return n;
}

function parseSemester(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const s = String(value).trim().toLowerCase();
  if (["1", "sem 1", "semester 1", "sem1", "s1"].includes(s)) return 1;
  if (["2", "sem 2", "semester 2", "sem2", "s2"].includes(s)) return 2;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  if (n === 1 || n === 2) return n;
  return null;
}

async function resolveProgrammeId(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    const byId = await Programme.findByPk(raw);
    return byId ? byId.id : null;
  }
  const byName = await Programme.findOne({
    where: sqlWhere(fn("LOWER", col("name")), raw.toLowerCase()),
  });
  return byName ? byName.id : null;
}

async function resolveDepartmentId(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    const byId = await Department.findByPk(raw);
    return byId ? byId.id : null;
  }
  const byName = await Department.findOne({
    where: sqlWhere(fn("LOWER", col("name")), raw.toLowerCase()),
  });
  return byName ? byName.id : null;
}

function studentEnrolmentError(role, { programme_id, year_of_study, semester }) {
  if (role !== "student") return null;
  if (!programme_id) return "programme is required for student users";
  if (year_of_study == null) return "year of study is required for student users";
  if (semester == null) return "semester is required for student users (1 or 2)";
  return null;
}

function readExcelMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error("Workbook has no sheets");
    err.status = 400;
    throw err;
  }
  const ws = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (!matrix.length) {
    const err = new Error("Sheet is empty");
    err.status = 400;
    throw err;
  }
  return { sheetName, matrix };
}

function expandAliases() {
  return {
    email_address: "email",
    mail: "email",
    full_name: "full_name",
    name: "full_name",
    fullname: "full_name",
    pass: "password",
    pwd: "password",
    mobile: "phone",
    cellphone: "phone",
    tel: "phone",
    telephone: "phone",
    admission_no: "admission_number",
    admission: "admission_number",
    reg_no: "admission_number",
    students: "student",
    programme_id: "programme",
    programme_name: "programme",
    program: "programme",
    course: "programme",
    year: "year_of_study",
    year_of_study: "year_of_study",
    study_year: "year_of_study",
    sem: "semester",
    semester: "semester",
  };
}

function normalizeExcelHeader(cell) {
  if (cell == null || String(cell).trim() === "") return null;
  let key = String(cell).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = expandAliases();
  return aliases[key] || key;
}

const sanitizeUser = (user) => {
  const plain = user.get ? user.get({ plain: true }) : { ...user };
  delete plain.password_hash;
  plain.profile_image_url = profileImagePath(plain.profile_image);
  return plain;
};

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      admission_number: user.admission_number,
      type: "user",
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

const PUBLIC_REGISTER_ROLES = ["student"];

const MAX_IMPORT_ROWS = 500;

function trimCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

exports.downloadImportTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Users", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.addRow(["email", "password", "full_name", "phone", "admission_number", "role"]);
    ws.addRow([
      "jane.doe@school.edu",
      "TempPass123!",
      "Jane Doe",
      "+254712345678",
      "ADM-2026-001",
      "student",
    ]);

    ws.getRow(1).font = { bold: true };

    const roleColumnLetter = "F";
    const lastDataRow = MAX_IMPORT_ROWS + 1;
    const roleListQuoted = `"${ALL_USER_ROLES.join(",")}"`;

    ws.dataValidations.add(`${roleColumnLetter}2:${roleColumnLetter}${lastDataRow}`, {
      type: "list",
      allowBlank: true,
      formulae: [roleListQuoted],
      showInputMessage: true,
      promptTitle: "Role",
      prompt: `Pick one value (${ALL_USER_ROLES.join(", ")}).`,
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Invalid role",
      error: `Must be one of: ${ALL_USER_ROLES.join(", ")}.`,
    });

    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="users-import-template.xlsx"');
    return res.send(Buffer.from(buf));
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.importUsersExcel = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    } catch {
      return res.status(400).json({ success: false, message: "Could not read Excel file" });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: "Workbook has no sheets" });
    }

    const ws = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    if (!matrix.length) {
      return res.status(400).json({ success: false, message: "Sheet is empty" });
    }

    const rawHeaders = matrix[0];
    const colKeys = rawHeaders.map(normalizeExcelHeader);
    const requiredCanonical = ["email", "password", "full_name", "role"];
    const present = new Set(colKeys.filter(Boolean));
    const missing = requiredCanonical.filter((k) => !present.has(k));
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missing.join(", ")}. Required: ${requiredCanonical.join(", ")}. Optional: phone, admission_number.`,
      });
    }

    const dataRows = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const excelRow = i + 1;
      const obj = {};
      for (let c = 0; c < colKeys.length; c++) {
        const k = colKeys[c];
        if (!k) continue;
        obj[k] = trimCell(row[c]);
      }

      const emptyRow =
        !obj.email &&
        !obj.password &&
        !obj.full_name &&
        !obj.role &&
        !(obj.phone || obj.admission_number);
      if (emptyRow) continue;

      dataRows.push({ excelRow, ...obj });
    }

    if (dataRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data rows found below the header row",
      });
    }

    if (dataRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Too many rows (${dataRows.length}). Maximum per upload is ${MAX_IMPORT_ROWS}.`,
      });
    }

    const errors = [];
    const created = [];
    const seenEmail = new Set();
    const seenAdmission = new Set();

    for (const row of dataRows) {
      const {
        excelRow,
        email,
        password,
        full_name,
        phone,
        admission_number,
        role: rawRole,
      } = row;

      const role = normalizeRole(rawRole);

      if (!email || !password || !full_name || !role) {
        errors.push({
          row: excelRow,
          message: "email, password, full_name, and role are required",
        });
        continue;
      }

      if (!ALL_USER_ROLES.includes(role)) {
        errors.push({
          row: excelRow,
          message: `Invalid role "${rawRole}". Allowed: ${ALL_USER_ROLES.join(", ")}`,
        });
        continue;
      }

      if (studentAdmissionRequired(role, admission_number)) {
        errors.push({
          row: excelRow,
          message: "admission_number is required for student users",
        });
        continue;
      }

      const emailLc = normalizeEmail(email);
      const admissionNorm = normalizeAdmissionNumber(admission_number);
      if (seenEmail.has(emailLc) || (admissionNorm && seenAdmission.has(admissionNorm))) {
        errors.push({
          row: excelRow,
          message: "Duplicate email or admission number within this file",
        });
        continue;
      }
      seenEmail.add(emailLc);
      if (admissionNorm) seenAdmission.add(admissionNorm);

      try {
        const exists = await User.findOne({
          where: duplicateUserWhere(
            email,
            role === "student" ? admission_number : null
          ),
        });
        if (exists) {
          errors.push({
            row: excelRow,
            message: "Email or admission number already exists in database",
          });
          continue;
        }

        const password_hash = await bcrypt.hash(password, 10);
        const user = await User.create({
          email: emailLc,
          password_hash,
          role,
          full_name,
          phone: phone || null,
          admission_number: role === "student" ? admissionNorm || null : null,
          profile_image: null,
        });
        created.push(sanitizeUser(user));
      } catch (err) {
        errors.push({
          row: excelRow,
          message: err.message || "Could not create user",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        createdCount: created.length,
        errorCount: errors.length,
        created,
        errors,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Preview Excel headers + sample rows for column mapping UI */
exports.previewImportExcel = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let matrix;
    try {
      ({ matrix } = readExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const rawHeaders = matrix[0].map((h, index) => ({
      index,
      header: trimCell(h) || `Column ${index + 1}`,
      suggested: normalizeExcelHeader(h),
    }));

    const dataRowCount = matrix.slice(1).filter((row) =>
      row.some((cell) => trimCell(cell) !== "")
    ).length;

    const sample = [];
    for (let i = 1; i < matrix.length && sample.length < 5; i++) {
      const row = matrix[i];
      if (!row.some((cell) => trimCell(cell) !== "")) continue;
      const obj = {};
      rawHeaders.forEach((col) => {
        obj[col.header] = trimCell(row[col.index]);
      });
      sample.push(obj);
    }

    return res.json({
      success: true,
      data: {
        columns: rawHeaders,
        sample,
        row_count: dataRowCount,
        system_fields: STUDENT_IMPORT_FIELDS,
        default_password: DEFAULT_STUDENT_PASSWORD,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Import students with explicit column mapping.
 * mapping: { email: "Email", full_name: "Name", ... } (system field -> Excel header)
 * defaults: { programme_id, year_of_study, semester, password }
 */
exports.importUsersMapped = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let mapping = {};
    let defaults = {};
    try {
      mapping =
        typeof req.body.mapping === "string"
          ? JSON.parse(req.body.mapping || "{}")
          : req.body.mapping || {};
      defaults =
        typeof req.body.defaults === "string"
          ? JSON.parse(req.body.defaults || "{}")
          : req.body.defaults || {};
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid mapping or defaults JSON",
      });
    }

    const requiredMapped = ["email", "full_name", "admission_number"];
    const missingMap = requiredMapped.filter((k) => !mapping[k]);
    if (missingMap.length) {
      return res.status(400).json({
        success: false,
        message: `Map required columns: ${missingMap.join(", ")}`,
      });
    }

    let matrix;
    try {
      ({ matrix } = readExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const headerRow = matrix[0].map((h, index) => ({
      index,
      header: trimCell(h) || `Column ${index + 1}`,
    }));
    const headerIndex = new Map(headerRow.map((h) => [h.header, h.index]));

    const defaultPassword =
      trimCell(defaults.password) || DEFAULT_STUDENT_PASSWORD;
    const defaultProgrammeId = await resolveProgrammeId(defaults.programme_id);
    const defaultYear = parseYearOfStudy(defaults.year_of_study);
    const defaultSemester = parseSemester(defaults.semester);

    const dataRows = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const excelRow = i + 1;
      const get = (systemKey) => {
        const header = mapping[systemKey];
        if (!header) return "";
        const idx = headerIndex.get(header);
        if (idx === undefined) return "";
        return trimCell(row[idx]);
      };

      const email = get("email");
      const full_name = get("full_name");
      const admission_number = get("admission_number");
      const phone = get("phone");
      const password = get("password") || defaultPassword;
      const programmeValue = get("programme");
      const yearValue = get("year_of_study");
      const semesterValue = get("semester");

      if (!email && !full_name && !admission_number && !phone) continue;

      dataRows.push({
        excelRow,
        email,
        full_name,
        admission_number,
        phone,
        password,
        programmeValue,
        yearValue,
        semesterValue,
      });
    }

    if (!dataRows.length) {
      return res.status(400).json({
        success: false,
        message: "No data rows found below the header row",
      });
    }
    if (dataRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Too many rows (${dataRows.length}). Maximum per upload is ${MAX_IMPORT_ROWS}.`,
      });
    }

    const errors = [];
    const created = [];
    const seenEmail = new Set();
    const seenAdmission = new Set();

    for (const row of dataRows) {
      const {
        excelRow,
        email,
        full_name,
        admission_number,
        phone,
        password,
        programmeValue,
        yearValue,
        semesterValue,
      } = row;

      if (!email || !full_name || !admission_number) {
        errors.push({
          row: excelRow,
          message: "email, full_name, and admission_number are required",
        });
        continue;
      }

      const programme_id =
        (await resolveProgrammeId(programmeValue)) || defaultProgrammeId;
      const year_of_study = parseYearOfStudy(yearValue) ?? defaultYear;
      const semester = parseSemester(semesterValue) ?? defaultSemester;

      const enrolErr = studentEnrolmentError("student", {
        programme_id,
        year_of_study,
        semester,
      });
      if (enrolErr) {
        errors.push({ row: excelRow, message: enrolErr });
        continue;
      }

      const emailLc = normalizeEmail(email);
      const admissionNorm = normalizeAdmissionNumber(admission_number);
      if (seenEmail.has(emailLc) || (admissionNorm && seenAdmission.has(admissionNorm))) {
        errors.push({
          row: excelRow,
          message: "Duplicate email or admission number within this file",
        });
        continue;
      }
      seenEmail.add(emailLc);
      if (admissionNorm) seenAdmission.add(admissionNorm);

      try {
        const exists = await User.findOne({
          where: duplicateUserWhere(email, admission_number),
        });
        if (exists) {
          errors.push({
            row: excelRow,
            message: "Email or admission number already exists in database",
          });
          continue;
        }

        const password_hash = await bcrypt.hash(password || DEFAULT_STUDENT_PASSWORD, 10);
        const user = await User.create({
          email: emailLc,
          password_hash,
          role: "student",
          full_name,
          phone: phone || null,
          admission_number: admissionNorm || null,
          programme_id,
          year_of_study,
          semester,
          profile_image: null,
          is_public: false,
          position: null,
        });
        created.push(sanitizeUser(user));
      } catch (err) {
        errors.push({
          row: excelRow,
          message: err.message || "Could not create user",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        createdCount: created.length,
        errorCount: errors.length,
        created,
        errors,
        default_password: DEFAULT_STUDENT_PASSWORD,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, admission_number, password } = req.body;
    const rawEmail = typeof email === "string" ? email.trim() : "";
    const rawAdmission =
      typeof admission_number === "string" ? admission_number.trim() : "";
    const ident = rawEmail || rawAdmission;
    const portalNorm =
      req.body.portal === undefined || req.body.portal === null
        ? ""
        : String(req.body.portal).trim().toLowerCase();

    if (ident === "" || password === undefined || password === null || password === "") {
      return res.status(400).json({
        success: false,
        message: "Password and email or admission number are required",
      });
    }

    const pwd = typeof password === "string" ? password : String(password);
    const identLower = ident.toLowerCase();
    const admissionNorm = normalizeAdmissionNumber(ident);

    let user = await User.findOne({ where: { email: normalizeEmail(ident) } });

    if (!user) {
      const rows = await sequelize.query(
        `SELECT id FROM users
         WHERE LOWER(TRIM(email)) = :ident
            OR UPPER(TRIM(admission_number)) = :admission
         LIMIT 1`,
        {
          replacements: { ident: identLower, admission: admissionNorm },
          type: QueryTypes.SELECT,
        }
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      user = row?.id ? await User.findByPk(row.id) : null;
    }

    if (!user) {
      await auditLogin(req, {
        status: "failed",
        description: "Login failed: user not found",
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(pwd, user.password_hash);
    if (!ok) {
      await auditLogin(req, {
        user,
        status: "failed",
        description: "Login failed: invalid password",
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.is_active) {
      await auditLogin(req, {
        user,
        status: "failed",
        description: "Login failed: account inactive",
      });
      return res.status(403).json({
        success: false,
        message:
          portalNorm === "public"
            ? "This account is inactive. Contact the school if you should have access."
            : "This account is inactive. Contact your administrator.",
      });
    }

    if (portalNorm === "admin" && ADMIN_PORTAL_LOGIN_BLOCKED_ROLES.includes(user.role)) {
      await auditLogin(req, {
        user,
        status: "failed",
        description: "Login failed: student blocked from admin portal",
      });
      return res.status(403).json({
        success: false,
        message: "This portal is for school admin and staff only. Students should use the student portal.",
      });
    }

    if (portalNorm === "public" && !PUBLIC_PORTAL_ALLOWED_ROLES.includes(user.role)) {
      await auditLogin(req, {
        user,
        status: "failed",
        description: "Login failed: staff blocked from student portal",
      });
      return res.status(403).json({
        success: false,
        message: "This portal is for students only. Staff should sign in through the admin portal.",
      });
    }

    await user.update({ last_login: new Date() });
    await auditLogin(req, {
      user,
      status: "success",
      description: `Login success (${portalNorm || "unspecified"} portal)`,
    });

    return res.json({
      success: true,
      data: { user: sanitizeUser(user), token: signToken(user) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { email, password, full_name, phone, admission_number, role } = req.body;
    const requestedRole = normalizeRole(role || "student");

    if (!PUBLIC_REGISTER_ROLES.includes(requestedRole)) {
      return res.status(403).json({
        success: false,
        message: `Public registration is only allowed for: ${PUBLIC_REGISTER_ROLES.join(", ")}`,
      });
    }

    if (!email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "email, password, and full_name are required",
      });
    }

    if (studentAdmissionRequired(requestedRole, admission_number)) {
      return res.status(400).json({
        success: false,
        message: "admission_number is required for student registration",
      });
    }

    const exists = await User.findOne({
      where: duplicateUserWhere(email, admission_number),
    });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email or admission number already in use",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizeEmail(email),
      password_hash,
      role: requestedRole,
      full_name,
      phone,
      admission_number:
        requestedRole === "student"
          ? normalizeAdmissionNumber(admission_number) || null
          : null,
      profile_image: req.body.profile_image || null,
    });

    return res.status(201).json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password_hash"] },
      include: [programmeInclude, departmentInclude],
    });
    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const roleFilter = normalizeRole(req.query.role);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const where = {};
    if (roleFilter && ALL_USER_ROLES.includes(roleFilter)) {
      where.role = roleFilter;
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ["password_hash"] },
      include: [programmeInclude, departmentInclude],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map((row) => sanitizeUser(row)),
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

/** Public directory: active staff & admin marked is_public (no auth). */
exports.listPublicStaff = async (req, res) => {
  try {
    const rows = await User.findAll({
      where: {
        is_public: true,
        is_active: true,
        role: { [Op.in]: ["admin", "staff"] },
      },
      attributes: ["id", "full_name", "role", "position", "phone", "profile_image", "created_at"],
      order: [
        ["role", "ASC"],
        ["full_name", "ASC"],
      ],
    });

    return res.json({
      success: true,
      data: rows.map((row) => {
        const plain = row.get({ plain: true });
        plain.profile_image_url = profileImagePath(plain.profile_image);
        return plain;
      }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    if (req.params.id !== req.user.id && !ADMIN_PORTAL_API_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ["password_hash"] },
      include: [programmeInclude, departmentInclude],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      email,
      password,
      full_name,
      phone,
      position,
      admission_number,
      role,
      profile_image,
      is_public,
      programme_id: programmeIdRaw,
      programme,
      year_of_study: yearRaw,
      semester: semesterRaw,
      department_id: departmentIdRaw,
    } = req.body;
    const normalizedRole = normalizeRole(role);

    if (!email || !password || !full_name || !normalizedRole) {
      return res.status(400).json({
        success: false,
        message: "email, password, full_name, and role are required",
      });
    }

    if (!ALL_USER_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${ALL_USER_ROLES.join(", ")}`,
      });
    }

    if (normalizedRole === ADMIN_ROLE && req.user.role !== ADMIN_ROLE) {
      return res.status(403).json({
        success: false,
        message: "Only an admin can create admin users",
      });
    }

    if (studentAdmissionRequired(normalizedRole, admission_number)) {
      return res.status(400).json({
        success: false,
        message: "admission_number is required for student users",
      });
    }

    let programme_id = null;
    let year_of_study = null;
    let semester = null;
    let department_id = null;

    if (normalizedRole === "student") {
      programme_id = await resolveProgrammeId(programmeIdRaw || programme);
      year_of_study = parseYearOfStudy(yearRaw);
      semester = parseSemester(semesterRaw);
      const enrolErr = studentEnrolmentError(normalizedRole, {
        programme_id,
        year_of_study,
        semester,
      });
      if (enrolErr) {
        return res.status(400).json({ success: false, message: enrolErr });
      }
    } else {
      department_id = await resolveDepartmentId(departmentIdRaw);
      if (departmentIdRaw && !department_id) {
        return res.status(400).json({ success: false, message: "Selected department was not found" });
      }
    }

    const exists = await User.findOne({
      where: duplicateUserWhere(
        email,
        normalizedRole === "student" ? admission_number : null
      ),
    });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email or admission number already in use",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const imageFilename = req.file?.filename || profile_image || null;
    const user = await User.create({
      email: normalizeEmail(email),
      password_hash,
      role: normalizedRole,
      full_name,
      phone,
      position:
        normalizedRole === "student"
          ? null
          : typeof position === "string"
            ? position.trim() || null
            : null,
      admission_number:
        normalizedRole === "student"
          ? normalizeAdmissionNumber(admission_number) || null
          : null,
      programme_id: normalizedRole === "student" ? programme_id : null,
      department_id: normalizedRole === "student" ? null : department_id,
      year_of_study: normalizedRole === "student" ? year_of_study : null,
      semester: normalizedRole === "student" ? semester : null,
      profile_image: imageFilename,
      is_public:
        normalizedRole === "student"
          ? false
          : is_public === true || is_public === "true",
    });

    const full = await User.findByPk(user.id, {
      attributes: { exclude: ["password_hash"] },
      include: [programmeInclude, departmentInclude],
    });

    return res.status(201).json({ success: true, data: sanitizeUser(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    if (req.params.id !== req.user.id && !ADMIN_PORTAL_API_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.role === ADMIN_ROLE && req.user.role !== ADMIN_ROLE) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const allowed = [
      "full_name",
      "phone",
      "position",
      "profile_image",
      "email",
      "admission_number",
      "role",
      "is_public",
      "programme_id",
      "department_id",
      "year_of_study",
      "semester",
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    if (req.body.programme !== undefined && req.body.programme_id === undefined) {
      patch.programme_id = await resolveProgrammeId(req.body.programme);
    } else if (patch.programme_id !== undefined) {
      patch.programme_id = (await resolveProgrammeId(patch.programme_id)) || null;
    }

    if (patch.department_id !== undefined) {
      const resolvedDept = await resolveDepartmentId(patch.department_id);
      if (patch.department_id && !resolvedDept) {
        return res.status(400).json({ success: false, message: "Selected department was not found" });
      }
      patch.department_id = resolvedDept;
    }

    if (patch.year_of_study !== undefined) {
      patch.year_of_study = parseYearOfStudy(patch.year_of_study);
    }
    if (patch.semester !== undefined) {
      patch.semester = parseSemester(patch.semester);
    }

    if (req.body.role !== undefined) {
      const requestedRole = normalizeRole(req.body.role);

      if (req.user.role !== ADMIN_ROLE) {
        if (requestedRole !== user.role) {
          return res.status(403).json({
            success: false,
            message: "You do not have permission to change user roles",
          });
        }
      } else if (!ALL_USER_ROLES.includes(requestedRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed: ${ALL_USER_ROLES.join(", ")}`,
        });
      } else if (requestedRole !== user.role) {
        patch.role = requestedRole;
      }
    }

    const effectiveRole = patch.role || user.role;
    const effectiveAdmission =
      patch.admission_number !== undefined
        ? patch.admission_number
        : user.admission_number;
    if (studentAdmissionRequired(effectiveRole, effectiveAdmission)) {
      return res.status(400).json({
        success: false,
        message: "admission_number is required for student users",
      });
    }

    if (patch.email !== undefined) patch.email = normalizeEmail(patch.email);
    if (effectiveRole !== "student") {
      patch.admission_number = null;
      patch.programme_id = null;
      patch.year_of_study = null;
      patch.semester = null;
    } else {
      patch.department_id = null;
      if (patch.admission_number !== undefined) {
        patch.admission_number = normalizeAdmissionNumber(patch.admission_number) || null;
      }
    }

    if (effectiveRole === "student") {
      const enrolErr = studentEnrolmentError(effectiveRole, {
        programme_id:
          patch.programme_id !== undefined ? patch.programme_id : user.programme_id,
        year_of_study:
          patch.year_of_study !== undefined ? patch.year_of_study : user.year_of_study,
        semester: patch.semester !== undefined ? patch.semester : user.semester,
      });
      if (enrolErr) {
        return res.status(400).json({ success: false, message: enrolErr });
      }
    }

    if (patch.position !== undefined) {
      patch.position =
        effectiveRole === "student"
          ? null
          : typeof patch.position === "string"
            ? patch.position.trim() || null
            : null;
    } else if (effectiveRole === "student") {
      patch.position = null;
    }

    if (req.file?.filename) {
      if (user.profile_image) deleteProfileFile(user.profile_image);
      patch.profile_image = req.file.filename;
    } else {
      const removeImage =
        req.body.remove_profile_image === true ||
        req.body.remove_profile_image === "true" ||
        req.body.profile_image === "" ||
        req.body.profile_image === "null";
      if (removeImage) {
        if (user.profile_image) deleteProfileFile(user.profile_image);
        patch.profile_image = null;
      }
    }

    if (patch.is_public !== undefined) {
      patch.is_public =
        effectiveRole === "student"
          ? false
          : patch.is_public === true || patch.is_public === "true";
    } else if (effectiveRole === "student") {
      patch.is_public = false;
    }

    await user.update(patch);
    const full = await User.findByPk(user.id, {
      attributes: { exclude: ["password_hash"] },
      include: [programmeInclude, departmentInclude],
    });
    return res.json({ success: true, data: sanitizeUser(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (req.user.id !== user.id && !STAFF_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const { current_password, new_password } = req.body;
    if (!new_password) {
      return res.status(400).json({ success: false, message: "new_password is required" });
    }

    if (req.user.id === user.id) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: "current_password is required" });
      }
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) {
        return res.status(400).json({ success: false, message: "Current password incorrect" });
      }
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await user.update({ password_hash });
    return res.json({ success: true, message: "Password updated" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    await user.update({ is_active: !user.is_active });
    return res.json({ success: true, data: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.role === ADMIN_ROLE && req.user.role !== ADMIN_ROLE) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    await user.destroy();
    return res.json({ success: true, message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
