const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const { Announcement, User } = require("../models");

const CATEGORIES = ["news", "event", "exam", "admission", "general"];
const AUDIENCES = ["public", "students", "all"];

/** Cover image is served through /uploads/announcements (static) */
function coverUrl(plain) {
  if (!plain.cover_image) return null;
  if (/^https?:\/\//i.test(plain.cover_image)) return plain.cover_image;
  return `/uploads/announcements/${plain.cover_image}`;
}

function serialize(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.cover_image_url = coverUrl(plain);
  return plain;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
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

function normalizeCategory(value, fallback = "news") {
  const s = String(value || "").trim().toLowerCase();
  return CATEGORIES.includes(s) ? s : fallback;
}

function normalizeAudience(value, fallback = "public") {
  const s = String(value || "").trim().toLowerCase();
  return AUDIENCES.includes(s) ? s : fallback;
}

/** Exam notices are for enrolled students only — never shown before login */
function enforceExamAudience(category, audience) {
  return category === "exam" ? "students" : audience;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

async function uniqueSlug(base, ignoreId = null) {
  const root = slugify(base) || "post";
  let candidate = root;
  let n = 1;
  // Loop until we find a slug not used by another row
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const where = { slug: candidate };
    if (ignoreId) where.id = { [Op.ne]: ignoreId };
    const existing = await Announcement.findOne({ where });
    if (!existing) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

function unlinkCover(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "announcements", filename);
  fs.unlink(filePath, () => {});
}

function autoExcerpt(body, provided) {
  const clean = toNullableString(provided);
  if (clean) return clean.slice(0, 500);
  const text = toNullableString(body);
  if (!text) return null;
  const stripped = text.replace(/\s+/g, " ").trim();
  return stripped.length > 200 ? `${stripped.slice(0, 197)}…` : stripped;
}

const publicOrder = [
  ["is_pinned", "DESC"],
  ["published_at", "DESC"],
  ["created_at", "DESC"],
];

/** Public site (before login): published items for public / everyone */
exports.listPublic = async (req, res) => {
  try {
    const where = {
      is_published: true,
      audience: { [Op.in]: ["public", "all"] },
      // Exam notices are student-only, never on the public site
      category: { [Op.ne]: "exam" },
    };
    if (
      req.query.category &&
      req.query.category !== "exam" &&
      CATEGORIES.includes(String(req.query.category))
    ) {
      where.category = String(req.query.category);
    }
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const rows = await Announcement.findAll({ where, order: publicOrder, limit });
    return res.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Public single post by slug */
exports.getPublicBySlug = async (req, res) => {
  try {
    const row = await Announcement.findOne({
      where: {
        slug: req.params.slug,
        is_published: true,
        audience: { [Op.in]: ["public", "all"] },
        category: { [Op.ne]: "exam" },
      },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }
    return res.json({ success: true, data: serialize(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Student portal (after login): published items for students / everyone */
exports.listForStudents = async (req, res) => {
  try {
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const rows = await Announcement.findAll({
      where: {
        is_published: true,
        audience: { [Op.in]: ["students", "all"] },
      },
      order: publicOrder,
      limit,
    });
    return res.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Admin/Staff: paginated list with optional search / category / audience / status */
exports.listAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.category && CATEGORIES.includes(String(req.query.category))) {
      where.category = String(req.query.category);
    }
    if (req.query.audience && AUDIENCES.includes(String(req.query.audience))) {
      where.audience = String(req.query.audience);
    }
    if (req.query.is_published !== undefined && req.query.is_published !== "") {
      where.is_published = toBool(req.query.is_published, true);
    }
    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${q}%` } },
          { excerpt: { [Op.iLike]: `%${q}%` } },
          { body: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await Announcement.findAndCountAll({
      where,
      order: [
        ["is_pinned", "DESC"],
        ["created_at", "DESC"],
      ],
      include: [{ model: User, as: "author", attributes: ["id", "full_name"] }],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serialize),
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

exports.getById = async (req, res) => {
  try {
    const row = await Announcement.findByPk(req.params.id, {
      include: [{ model: User, as: "author", attributes: ["id", "full_name"] }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }
    return res.json({ success: true, data: serialize(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const title = toNullableString(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const isPublished = toBool(req.body.is_published, true);
    const slug = await uniqueSlug(title);
    const category = normalizeCategory(req.body.category);

    const row = await Announcement.create({
      title,
      slug,
      excerpt: autoExcerpt(req.body.body, req.body.excerpt),
      body: toNullableString(req.body.body),
      category,
      audience: enforceExamAudience(category, normalizeAudience(req.body.audience)),
      cover_image: req.file?.filename || null,
      event_date: toDate(req.body.event_date),
      event_end: toDate(req.body.event_end),
      is_published: isPublished,
      is_pinned: toBool(req.body.is_pinned, false),
      published_at: isPublished ? toDate(req.body.published_at) || new Date() : null,
      created_by: req.user?.id || null,
    });

    return res.status(201).json({ success: true, data: serialize(row) });
  } catch (error) {
    if (req.file?.filename) unlinkCover(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const row = await Announcement.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }

    const updates = {};

    if (req.body.title !== undefined) {
      const title = toNullableString(req.body.title);
      if (!title) {
        return res.status(400).json({ success: false, message: "title cannot be empty" });
      }
      updates.title = title;
      if (title !== row.title) {
        updates.slug = await uniqueSlug(title, row.id);
      }
    }
    if (req.body.body !== undefined) {
      updates.body = toNullableString(req.body.body);
    }
    if (req.body.excerpt !== undefined || req.body.body !== undefined) {
      updates.excerpt = autoExcerpt(
        req.body.body !== undefined ? req.body.body : row.body,
        req.body.excerpt !== undefined ? req.body.excerpt : row.excerpt
      );
    }
    if (req.body.category !== undefined) {
      updates.category = normalizeCategory(req.body.category, row.category);
    }
    if (req.body.audience !== undefined) {
      updates.audience = normalizeAudience(req.body.audience, row.audience);
    }
    // Exam posts are always student-portal only, whatever was submitted
    const nextCategory = updates.category !== undefined ? updates.category : row.category;
    if (nextCategory === "exam") {
      updates.audience = "students";
    }
    if (req.body.event_date !== undefined) {
      updates.event_date = toDate(req.body.event_date);
    }
    if (req.body.event_end !== undefined) {
      updates.event_end = toDate(req.body.event_end);
    }
    if (req.body.is_pinned !== undefined) {
      updates.is_pinned = toBool(req.body.is_pinned, row.is_pinned);
    }
    if (req.body.is_published !== undefined) {
      const nextPublished = toBool(req.body.is_published, row.is_published);
      updates.is_published = nextPublished;
      // First time going live → stamp published_at
      if (nextPublished && !row.published_at) {
        updates.published_at = new Date();
      }
      if (!nextPublished) {
        updates.published_at = null;
      }
    }

    const previousCover = row.cover_image;
    if (req.file?.filename) {
      updates.cover_image = req.file.filename;
    } else {
      const removeCover =
        req.body.remove_cover_image === true ||
        req.body.remove_cover_image === "true" ||
        req.body.cover_image === "" ||
        req.body.cover_image === "null";
      if (removeCover) {
        updates.cover_image = null;
      }
    }

    await row.update(updates);

    // Clean up the old file once the row no longer points to it
    if (
      previousCover &&
      updates.cover_image !== undefined &&
      previousCover !== updates.cover_image
    ) {
      unlinkCover(previousCover);
    }

    return res.json({ success: true, data: serialize(row) });
  } catch (error) {
    if (req.file?.filename) unlinkCover(req.file.filename);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const row = await Announcement.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }
    const cover = row.cover_image;
    await row.destroy();
    unlinkCover(cover);
    return res.json({ success: true, message: "Announcement deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
