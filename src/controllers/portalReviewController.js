const { PortalReview, User, Student, Parent } = require("../models");
const { parsePagination } = require("../utils/pagination");
const { PUBLIC_PORTAL_ALLOWED_ROLES } = require("../constants/userRoles");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatPublicRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const profile_picture =
    plain.profile_image_url ||
    plain.student?.profile_picture ||
    plain.user?.profile_image ||
    null;
  return {
    id: plain.id,
    name: plain.display_name,
    comment: plain.comment,
    rating: plain.rating,
    profile_picture,
    reviewer_role: plain.reviewer_role,
    created_at: plain.created_at,
  };
}

async function resolveReviewerSnapshot(user) {
  if (user.role === "student") {
    const student = await Student.findOne({ where: { user_id: user.id } });
    if (!student) {
      const err = new Error("Student profile not found");
      err.statusCode = 404;
      throw err;
    }
    const displayName = String(user.full_name || user.username || "Student").trim() || "Student";
    return {
      student_id: student.id,
      parent_id: null,
      reviewer_role: "student",
      display_name: displayName.slice(0, 100),
      profile_image_url: student.profile_picture || user.profile_image || null,
    };
  }
  if (user.role === "parent") {
    const parent = await Parent.findOne({
      where: { user_id: user.id },
      order: [["created_at", "DESC"]],
    });
    const displayName = String(user.full_name || user.username || "Parent").trim() || "Parent";
    return {
      student_id: null,
      parent_id: parent?.id ?? null,
      reviewer_role: "parent",
      display_name: displayName.slice(0, 100),
      profile_image_url: user.profile_image || null,
    };
  }
  const err = new Error("Only parents and students can submit reviews");
  err.statusCode = 403;
  throw err;
}

function assertPortalRole(user) {
  if (!PUBLIC_PORTAL_ALLOWED_ROLES.includes(user.role)) {
    const err = new Error("Not allowed");
    err.statusCode = 403;
    throw err;
  }
}

exports.listApprovedPublic = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);

    const { count, rows } = await PortalReview.findAndCountAll({
      where: { status: "approved" },
      include: [
        { model: User, as: "user", attributes: ["id", "profile_image"], required: false },
        {
          model: Student,
          as: "student",
          attributes: ["id", "profile_picture"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map(formatPublicRow),
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

exports.getMyReviewStatus = async (req, res) => {
  try {
    assertPortalRole(req.user);
    const existing = await PortalReview.findOne({ where: { user_id: req.user.id } });
    return res.json({
      success: true,
      data: {
        has_review: !!existing,
        review: existing || null,
        can_submit: !existing,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.submitMyReview = async (req, res) => {
  try {
    assertPortalRole(req.user);
    const existing = await PortalReview.findOne({ where: { user_id: req.user.id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted a review.",
        data: existing,
      });
    }

    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
    }
    if (!comment || comment.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Please write at least 10 characters in your review",
      });
    }
    if (comment.length > 2000) {
      return res.status(400).json({ success: false, message: "Review is too long (max 2000 characters)" });
    }

    const snapshot = await resolveReviewerSnapshot(req.user);
    const row = await PortalReview.create({
      user_id: req.user.id,
      ...snapshot,
      rating,
      comment,
      status: "pending",
    });

    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    const code = error.statusCode || 400;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.listPortalReviewsAdmin = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;

    const { page, limit, offset } = parsePagination(req);

    const { count, rows } = await PortalReview.findAndCountAll({
      where,
      include: [
        { model: User, as: "user", ...userSafe },
        {
          model: Student,
          as: "student",
          attributes: ["id", "profile_picture", "admission_number"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
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
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPortalReview = async (req, res) => {
  try {
    const row = await PortalReview.findByPk(req.params.id, {
      include: [
        { model: User, as: "user", ...userSafe },
        {
          model: Student,
          as: "student",
          attributes: ["id", "profile_picture", "admission_number"],
          required: false,
        },
      ],
    });
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.approvePortalReview = async (req, res) => {
  try {
    const row = await PortalReview.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.update({
      status: "approved",
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.rejectPortalReview = async (req, res) => {
  try {
    const row = await PortalReview.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.update({
      status: "rejected",
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deletePortalReview = async (req, res) => {
  try {
    const row = await PortalReview.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
