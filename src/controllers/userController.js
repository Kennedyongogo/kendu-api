const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const { QueryTypes } = require("sequelize");
const { User, Teacher, SchoolAdmin, sequelize } = require("../models");
const config = require("../config/config");
const {
  SUPER_ADMIN_ROLE,
  STAFF_ROLES,
  ADMIN_PORTAL_API_ROLES,
  ADMIN_PORTAL_LOGIN_BLOCKED_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  ALL_USER_ROLES,
} = require("../constants/userRoles");
const { normalizeEmail, normalizeUsername, duplicateUserWhere } = require("../utils/userIdentity");

const sanitizeUser = (user) => {
  const plain = user.get ? user.get({ plain: true }) : user;
  delete plain.password_hash;
  return plain;
};

const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, username: user.username, type: "user", role: user.role },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

const PUBLIC_REGISTER_ROLES = ["parent"];

const MAX_IMPORT_ROWS = 500;

function normalizeExcelHeader(cell) {
  if (cell == null || String(cell).trim() === "") return null;
  let key = String(cell).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    user_name: "username",
    login: "username",
    userid: "username",
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
  };
  return aliases[key] || key;
}

function trimCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function normalizeRoleCell(val) {
  if (val == null || val === "") return "";
  return String(val).trim().toLowerCase().replace(/\s+/g, "_");
}

exports.downloadImportTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Users", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.addRow(["username", "email", "password", "full_name", "phone", "address", "role"]);
    ws.addRow([
      "jdoe",
      "jane.doe@school.edu",
      "TempPass123!",
      "Jane Doe",
      "+254712345678",
      "City",
      "teacher",
    ]);

    ws.getRow(1).font = { bold: true };

    const roleColumnLetter = "G";
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
    const requiredCanonical = ["username", "email", "password", "full_name", "role"];
    const present = new Set(colKeys.filter(Boolean));
    const missing = requiredCanonical.filter((k) => !present.has(k));
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missing.join(", ")}. Required: ${requiredCanonical.join(", ")}. Optional: phone, address.`,
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
        !obj.username &&
        !obj.email &&
        !obj.password &&
        !obj.full_name &&
        !obj.role &&
        !(obj.phone || obj.address);
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
    const seenUser = new Set();
    const seenEmail = new Set();

    for (const row of dataRows) {
      const {
        excelRow,
        username,
        email,
        password,
        full_name,
        phone,
        address,
        role: rawRole,
      } = row;

      const role = normalizeRoleCell(rawRole);

      if (!username || !email || !password || !full_name || !role) {
        errors.push({
          row: excelRow,
          message: "username, email, password, full_name, and role are required",
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

      if (role === SUPER_ADMIN_ROLE && req.user.role !== SUPER_ADMIN_ROLE) {
        errors.push({
          row: excelRow,
          message: "Only a super admin can create super_admin users",
        });
        continue;
      }

      const emailLc = email.toLowerCase();
      const userLc = username.toLowerCase();
      if (seenUser.has(userLc) || seenEmail.has(emailLc)) {
        errors.push({
          row: excelRow,
          message: "Duplicate username or email within this file",
        });
        continue;
      }
      seenUser.add(userLc);
      seenEmail.add(emailLc);

      try {
        const exists = await User.findOne({
          where: duplicateUserWhere(email, username),
        });
        if (exists) {
          errors.push({
            row: excelRow,
            message: "Email or username already exists in database",
          });
          continue;
        }

        const password_hash = await bcrypt.hash(password, 10);
        const user = await User.create({
          username: normalizeUsername(username),
          email: emailLc,
          password_hash,
          role,
          full_name,
          phone: phone || null,
          address: address || null,
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

exports.login = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const rawEmail = typeof email === "string" ? email.trim() : "";
    const rawUsername = typeof username === "string" ? username.trim() : "";
    const ident = (rawEmail || rawUsername || "").trim();
    const portalNorm =
      req.body.portal === undefined || req.body.portal === null
        ? ""
        : String(req.body.portal).trim().toLowerCase();

    if (
      ident === "" ||
      password === undefined ||
      password === null ||
      password === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Password and email or username are required",
      });
    }

    const pwd = typeof password === "string" ? password : String(password);
    const identLower = ident.toLowerCase();

    // 1) Indexed path: emails are stored lowercased for users created via admin.
    let user = await User.findOne({ where: { email: normalizeEmail(ident) } });

    // 2) Postgres-safe match on email OR username (case/spacing). Avoids Sequelize+Op.or edge cases.
    if (!user) {
      const rows = await sequelize.query(
        `SELECT id FROM users WHERE LOWER(TRIM(email)) = :ident OR LOWER(TRIM(username)) = :ident LIMIT 1`,
        { replacements: { ident: identLower }, type: QueryTypes.SELECT }
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      user = row?.id ? await User.findByPk(row.id) : null;
    }

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(pwd, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          portalNorm === "public"
            ? "This account is inactive. Contact the school if you should have access (for example after fees are cleared)."
            : "This account is inactive. Contact your administrator.",
      });
    }

    if (portalNorm === "admin" && ADMIN_PORTAL_LOGIN_BLOCKED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "This portal is for school staff and teachers only. Parents and students should use their own portal.",
      });
    }

    if (portalNorm === "public" && !PUBLIC_PORTAL_ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "This portal is for parents and students only. School staff should sign in through the admin portal.",
      });
    }

    await user.update({ last_login: new Date() });

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
    const { username, email, password, full_name, phone, address, role } = req.body;
    const requestedRole = role || "parent";

    if (!PUBLIC_REGISTER_ROLES.includes(requestedRole)) {
      return res.status(403).json({
        success: false,
        message: `Public registration is only allowed for: ${PUBLIC_REGISTER_ROLES.join(", ")}`,
      });
    }

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "username, email, password, and full_name are required",
      });
    }

    const exists = await User.findOne({
      where: duplicateUserWhere(email, username),
    });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email or username already in use" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: normalizeUsername(username),
      email: normalizeEmail(email),
      password_hash,
      role: requestedRole,
      full_name,
      phone,
      address,
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
      include: [
        {
          model: Teacher,
          as: "teacher_profile",
          attributes: ["profile_picture"],
          required: false,
        },
        {
          model: SchoolAdmin,
          as: "school_admin_profile",
          attributes: ["profile_picture"],
          required: false,
        },
      ],
    });
    const userData = user.get({ plain: true });
    // If teacher, use teacher's profile_picture, else if school admin use school admin's profile_picture, else use user's profile_image
    if (userData.teacher_profile?.profile_picture) {
      userData.profile_image = userData.teacher_profile.profile_picture;
    } else if (userData.school_admin_profile?.profile_picture) {
      userData.profile_image = userData.school_admin_profile.profile_picture;
    }
    delete userData.teacher_profile;
    delete userData.school_admin_profile;
    console.log("User data sent to client:", userData);
    return res.json({ success: true, data: userData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const roleFilter = req.query.role;
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
      order: [["created_at", "DESC"]],
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

exports.getUserById = async (req, res) => {
  try {
    if (req.params.id !== req.user.id && !ADMIN_PORTAL_API_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ["password_hash"] },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, full_name, phone, address, role, profile_image } = req.body;
    if (!username || !email || !password || !full_name || !role) {
      return res.status(400).json({
        success: false,
        message: "username, email, password, full_name, and role are required",
      });
    }

    if (!ALL_USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${ALL_USER_ROLES.join(", ")}`,
      });
    }

    if (role === SUPER_ADMIN_ROLE && req.user.role !== SUPER_ADMIN_ROLE) {
      return res.status(403).json({
        success: false,
        message: "Only a super admin can create super admin users",
      });
    }

    const exists = await User.findOne({
      where: duplicateUserWhere(email, username),
    });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email or username already in use" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: normalizeUsername(username),
      email: normalizeEmail(email),
      password_hash,
      role,
      full_name,
      phone,
      address,
      profile_image: profile_image || null,
    });

    return res.status(201).json({ success: true, data: sanitizeUser(user) });
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

    if (user.role === SUPER_ADMIN_ROLE && req.user.role !== SUPER_ADMIN_ROLE) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const allowed = ["full_name", "phone", "address", "profile_image", "email", "username", "role"];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    if (req.body.role !== undefined) {
      const requestedRole = req.body.role;

      if (!STAFF_ROLES.includes(req.user.role)) {
        if (requestedRole !== user.role) {
          return res.status(403).json({
            success: false,
            message: "You do not have permission to change user roles",
          });
        }
      } else if (requestedRole === SUPER_ADMIN_ROLE && req.user.role !== SUPER_ADMIN_ROLE) {
        return res.status(403).json({
          success: false,
          message: "Only a super admin can assign the super admin role",
        });
      } else if (
        user.role === SUPER_ADMIN_ROLE &&
        requestedRole !== SUPER_ADMIN_ROLE &&
        req.user.role !== SUPER_ADMIN_ROLE
      ) {
        return res.status(403).json({
          success: false,
          message: "Only a super admin can change a super admin user's role",
        });
      } else if (!ALL_USER_ROLES.includes(requestedRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Allowed: ${ALL_USER_ROLES.join(", ")}`,
        });
      } else if (requestedRole !== user.role) {
        patch.role = requestedRole;
      }
    }

    if (patch.email !== undefined) patch.email = normalizeEmail(patch.email);
    if (patch.username !== undefined) patch.username = normalizeUsername(patch.username);

    await user.update(patch);
    return res.json({ success: true, data: sanitizeUser(user) });
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

    if (
      req.user.id !== user.id &&
      !["super_admin", "admin", "accountant"].includes(req.user.role)
    ) {
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
    if (user.role === SUPER_ADMIN_ROLE && req.user.role !== SUPER_ADMIN_ROLE) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    await user.destroy();
    return res.json({ success: true, message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
