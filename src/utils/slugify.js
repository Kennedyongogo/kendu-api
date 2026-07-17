const { Op } = require("sequelize");

function slugify(text) {
  let s = String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

async function ensureUniqueSlug(Model, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 50) {
    const where = { slug };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const clash = await Model.findOne({ where });
    if (!clash) return slug;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

module.exports = { slugify, ensureUniqueSlug };
