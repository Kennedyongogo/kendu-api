const { Op } = require("sequelize");
const { News } = require("../models");
const PosterGenerator = require("../services/posterGenerator");
const { slugify, ensureUniqueSlug } = require("../utils/slugify");
const { parsePagination } = require("../utils/pagination");

exports.listPublished = async (req, res) => {
  try {
    const rows = await News.findAll({
      where: {
        is_published: true,
        [Op.or]: [{ published_at: null }, { published_at: { [Op.lte]: new Date() } }],
      },
      order: [["published_at", "DESC"]],
      limit: Math.min(Number(req.query.limit) || 50, 100),
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublishedBySlug = async (req, res) => {
  try {
    const row = await News.findOne({
      where: {
        slug: req.params.slug,
        is_published: true,
      },
    });
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    if (req.query.record_view === "1") {
      await row.increment("view_count");
      await row.reload();
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listNews = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const where = {};
    if (req.query.category) where.category = req.query.category;
    if (req.query.is_published !== undefined) where.is_published = req.query.is_published === "true";
    if (req.query.target_audience) where.target_audience = req.query.target_audience;

    const search = String(req.query.search || "").trim();
    if (search) {
      const pattern = `%${search}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: pattern } },
        { summary: { [Op.iLike]: pattern } },
        { slug: { [Op.iLike]: pattern } },
      ];
    }

    const { count, rows } = await News.findAndCountAll({
      where,
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

exports.getNews = async (req, res) => {
  try {
    const row = await News.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createNews = async (req, res) => {
  try {
    const {
      title,
      content,
      summary,
      category,
      tags,
      target_audience,
      is_published,
      generate_poster,
      poster_description,
      color_palette,
      generatePoster,
      slug: incomingSlug,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: "title and content are required" });
    }

    const baseSlug = incomingSlug ? slugify(incomingSlug) : slugify(title);
    const slug = await ensureUniqueSlug(News, baseSlug);

    let poster_image = req.body.poster_image || null;
    let poster_prompt = req.body.poster_prompt || null;
    let poster_color_palette = req.body.poster_color_palette || color_palette || null;

    const shouldPoster = !!(generate_poster || generatePoster);
    let posterMeta = null;
    if (shouldPoster) {
      try {
        const desc = poster_description || summary || title;
        const paletteKey = poster_color_palette || color_palette || "academic";
        const posterCat = PosterGenerator.mapNewsCategory(category || "general");
        posterMeta = await PosterGenerator.generatePoster(desc, posterCat, paletteKey, "news");
        poster_image = posterMeta.imageUrl;
        poster_prompt = posterMeta.prompt;
      } catch (e) {
        return res.status(502).json({ success: false, message: e.message || "Poster generation failed" });
      }
    }

    const row = await News.create({
      title,
      slug,
      summary: summary ?? poster_description ?? null,
      content,
      category: category || "general",
      poster_image,
      poster_prompt,
      poster_color_palette: poster_color_palette
        ? typeof poster_color_palette === "object"
          ? poster_color_palette
          : { palette: poster_color_palette }
        : null,
      published_by: req.user?.id || null,
      published_at: req.body.published_at ? new Date(req.body.published_at) : new Date(),
      is_published: is_published !== false,
      tags: tags || [],
      target_audience: target_audience || "all",
    });

    return res.status(201).json({ success: true, data: row, poster: posterMeta });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateNews = async (req, res) => {
  try {
    const row = await News.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    const allowed = [
      "title",
      "summary",
      "content",
      "category",
      "poster_image",
      "poster_prompt",
      "poster_color_palette",
      "published_at",
      "is_published",
      "tags",
      "target_audience",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }

    if (req.body.slug) {
      patch.slug = await ensureUniqueSlug(News, slugify(req.body.slug), row.id);
    }

    let posterMeta = null;
    if (req.body.generate_poster || req.body.generatePoster) {
      const desc =
        req.body.poster_description || patch.summary || row.summary || row.title;
      const paletteKey =
        req.body.color_palette ||
        req.body.poster_color_palette ||
        row.poster_color_palette?.palette ||
        "academic";
      const posterCat = PosterGenerator.mapNewsCategory(patch.category || row.category);
      posterMeta = await PosterGenerator.generatePoster(desc, posterCat, paletteKey, "news");
      if (!posterMeta.success) {
        return res.status(502).json({ success: false, message: posterMeta.error || "Poster generation failed" });
      }
      patch.poster_image = posterMeta.imageUrl;
      patch.poster_prompt = posterMeta.prompt;
    }

    await row.update(patch);
    return res.json({ success: true, data: row, poster: posterMeta });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.generatePosterForNews = async (req, res) => {
  try {
    const row = await News.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    const desc =
      req.body.poster_description || req.body.description || row.summary || row.title;
    const paletteKey =
      req.body.color_palette || row.poster_color_palette?.palette || "academic";
    const posterCat = PosterGenerator.mapNewsCategory(req.body.category || row.category);

    let posterMeta;
    try {
      posterMeta = await PosterGenerator.generatePoster(desc, posterCat, paletteKey, "news");
    } catch (e) {
      return res.status(502).json({ success: false, message: e.message || "Poster generation failed" });
    }

    await row.update({
      poster_image: posterMeta.imageUrl,
      poster_prompt: posterMeta.prompt,
      poster_color_palette: req.body.poster_color_palette || { palette: paletteKey },
    });

    return res.json({ success: true, data: row, poster: posterMeta });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteNews = async (req, res) => {
  try {
    const row = await News.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
