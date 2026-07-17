const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { sequelize, User, SchoolAdmin } = require("../models");
const { normalizeEmail, normalizeUsername, duplicateUserWhere } = require("../utils/userIdentity");
const { unlinkProfilePictureIfExists } = require("../utils/profilePictureStorage");

const userExclude = { exclude: ["password_hash"] };

exports.listUsersWithoutSchoolAdminProfile = async (req, res) => {
  try {
    console.log('Request user role:', req.user?.role);
    const users = await User.findAll({
      where: {
        is_active: true,
        role: { [Op.in]: ['super_admin', 'admin', 'accountant', 'librarian'] },
      },
      attributes: userExclude,
      include: [
        {
          model: SchoolAdmin,
          as: "school_admin_profile",
          required: false,
        },
      ],
    });
    console.log('Found users:', users.length, users.map(u => ({ id: u.id, role: u.role, full_name: u.full_name, has_profile: !!u.school_admin_profile })));
    const eligible = users.filter((u) => !u.school_admin_profile);
    console.log('Eligible users:', eligible.length, eligible.map(u => ({ id: u.id, role: u.role, full_name: u.full_name })));
    return res.json({ success: true, data: eligible });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listSchoolAdmins = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { count, rows } = await SchoolAdmin.findAndCountAll({
      include: [{ model: User, as: "user", attributes: userExclude }],
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

exports.getSchoolAdmin = async (req, res) => {
  try {
    const row = await SchoolAdmin.findByPk(req.params.id, {
      include: [{ model: User, as: "user", attributes: userExclude }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Admin record not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMySchoolAdminProfile = async (req, res) => {
  try {
    const row = await SchoolAdmin.findOne({
      where: { user_id: req.user.id },
      include: [{ model: User, as: "user", attributes: userExclude }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "School admin profile not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSchoolAdmin = async (req, res) => {
  const { user_id, admin_type, profile_picture } = req.body;

  if (!user_id || !admin_type) {
    return res.status(400).json({
      success: false,
      message: "user_id and admin_type are required",
    });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(user_id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "user_id must reference an existing user",
      });
    }
    const existingProfile = await SchoolAdmin.findOne({ where: { user_id }, transaction: t });
    if (existingProfile) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "This user already has a school admin profile",
      });
    }

    let userRole = "admin";
    if (admin_type === "accountant") userRole = "accountant";
    if (admin_type === "librarian") userRole = "librarian";
    await user.update({ role: userRole }, { transaction: t });

    const adminRow = await SchoolAdmin.create(
      {
        user_id,
        admin_type,
        profile_picture: req.file ? `/uploads/misc/${req.file.filename}` : null,
      },
      { transaction: t }
    );

    await t.commit();

    const created = await SchoolAdmin.findByPk(adminRow.id, {
      include: [{ model: User, as: "user", attributes: userExclude }],
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await t.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSchoolAdmin = async (req, res) => {
  try {
    const adminRow = await SchoolAdmin.findByPk(req.params.id);
    if (!adminRow) {
      return res.status(404).json({ success: false, message: "Admin record not found" });
    }

    const fields = ["admin_type", "profile_picture"];
    const patch = {};
    for (const key of fields) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (req.file) {
      patch.profile_picture = `/uploads/misc/${req.file.filename}`;
    }
    await adminRow.update(patch);

    if (req.body.admin_type && adminRow.user_id) {
      const at = req.body.admin_type;
      let userRole = "admin";
      if (at === "accountant") userRole = "accountant";
      if (at === "librarian") userRole = "librarian";
      await User.update({ role: userRole }, { where: { id: adminRow.user_id } });
    }

    if (req.body.user && adminRow.user_id) {
      const user = await User.findByPk(adminRow.user_id);
      if (user) {
        const u = req.body.user;
        const allowed = ["full_name", "phone", "address", "profile_image", "email", "username"];
        const userPatch = {};
        for (const key of allowed) {
          if (u[key] !== undefined) userPatch[key] = u[key];
        }
        if (userPatch.email !== undefined) userPatch.email = normalizeEmail(userPatch.email);
        if (userPatch.username !== undefined) userPatch.username = normalizeUsername(userPatch.username);
        if (Object.keys(userPatch).length) await user.update(userPatch);
      }
    }

    const updated = await SchoolAdmin.findByPk(adminRow.id, {
      include: [{ model: User, as: "user", attributes: userExclude }],
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteSchoolAdmin = async (req, res) => {
  const deleteUserAccount =
    req.query.delete_user_account === "true" ||
    req.query.delete_user_account === "1" ||
    req.body?.delete_user_account === true ||
    req.query.keep_user === "false" ||
    req.query.keep_user === "0";

  const keepUser = !deleteUserAccount;

  const t = await sequelize.transaction();
  try {
    const adminRow = await SchoolAdmin.findByPk(req.params.id, { transaction: t });
    if (!adminRow) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Admin record not found" });
    }
    const userId = adminRow.user_id;
    const picPath = adminRow.profile_picture;

    await adminRow.destroy({ transaction: t });

    if (!keepUser) {
      await User.destroy({ where: { id: userId }, transaction: t });
    }

    await t.commit();

    if (picPath) unlinkProfilePictureIfExists(picPath);

    return res.json({
      success: true,
      message: keepUser
        ? "School admin profile removed; user account kept (can link a new profile later)."
        : "School admin profile and user account deleted.",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicListSchoolAdmins = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { count, rows } = await SchoolAdmin.findAndCountAll({
      attributes: ["id", "admin_type", "profile_picture"],
      include: [{ model: User, as: "user", attributes: ["full_name", "profile_image"] }],
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

