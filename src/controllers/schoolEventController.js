const { Op } = require("sequelize");
const { SchoolEvent } = require("../models");
const PosterGenerator = require("../services/posterGenerator");
const { slugify, ensureUniqueSlug } = require("../utils/slugify");
const { parsePagination } = require("../utils/pagination");
const { isOnlineDelivery, provisionLiveFields } = require("../services/eventLiveProvision");
const { getEventJoinWindow, canRegenerateEventPoster } = require("../utils/eventJoinWindow");

function toPublishedEventDto(row) {
  const j = row.toJSON ? row.toJSON() : { ...row };
  if (isOnlineDelivery(j.delivery_mode)) {
    const join_window = getEventJoinWindow({
      start_date: j.start_date,
      end_date: j.end_date,
      session_status: j.session_status || "scheduled",
      is_staff: false,
    });
    j.join_window = join_window;
    j.can_join_live = join_window.can_join;
  } else {
    j.join_window = null;
    j.can_join_live = false;
  }
  return j;
}

exports.listPublished = async (req, res) => {
  try {
    const rows = await SchoolEvent.findAll({
      where: { is_published: true },
      order: [["start_date", "ASC"]],
      limit: Math.min(Number(req.query.limit) || 50, 100),
    });
    return res.json({ success: true, data: rows.map(toPublishedEventDto) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listPublishedUpcoming = async (req, res) => {
  try {
    const now = new Date();
    const rows = await SchoolEvent.findAll({
      where: {
        is_published: true,
        end_date: { [Op.gte]: now },
      },
      order: [["start_date", "ASC"]],
      limit: Math.min(Number(req.query.limit) || 50, 100),
    });
    return res.json({ success: true, data: rows.map(toPublishedEventDto) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublishedBySlug = async (req, res) => {
  try {
    const row = await SchoolEvent.findOne({
      where: { slug: req.params.slug, is_published: true },
    });
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: toPublishedEventDto(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listSchoolEvents = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const where = {};
    if (req.query.event_type) where.event_type = req.query.event_type;
    if (req.query.is_published !== undefined) where.is_published = req.query.is_published === "true";
    if (req.query.is_featured !== undefined) where.is_featured = req.query.is_featured === "true";

    const search = String(req.query.search || "").trim();
    if (search) {
      const pattern = `%${search}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: pattern } },
        { description: { [Op.iLike]: pattern } },
        { slug: { [Op.iLike]: pattern } },
        { location: { [Op.iLike]: pattern } },
      ];
    }

    const { count, rows } = await SchoolEvent.findAndCountAll({
      where,
      order: [["start_date", "DESC"]],
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

exports.getSchoolEvent = async (req, res) => {
  try {
    const row = await SchoolEvent.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createSchoolEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      event_type,
      start_date,
      end_date,
      delivery_mode,
      location,
      meeting_link,
      tags,
      is_published,
      is_featured,
      generate_poster,
      generatePoster,
      poster_description,
      color_palette,
      slug: incomingSlug,
    } = req.body;

    if (!title || !description || !event_type || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "title, description, event_type, start_date, end_date are required",
      });
    }

    const baseSlug = incomingSlug ? slugify(incomingSlug) : slugify(title);
    const slug = await ensureUniqueSlug(SchoolEvent, baseSlug);

    let poster_image = req.body.poster_image || null;
    let poster_prompt = req.body.poster_prompt || null;
    let poster_color_palette = req.body.poster_color_palette || color_palette || null;

    let posterMeta = null;
    if (generate_poster || generatePoster) {
      try {
        const desc = poster_description || description || title;
        const paletteKey = poster_color_palette || color_palette || "festive";
        posterMeta = await PosterGenerator.generatePoster(desc, "event", paletteKey, "event");
        poster_image = posterMeta.imageUrl;
        poster_prompt = posterMeta.prompt;
      } catch (e) {
        return res.status(502).json({ success: false, message: e.message || "Poster generation failed" });
      }
    }

    const mode = delivery_mode || "physical";

    const row = await SchoolEvent.create({
      title,
      slug,
      description,
      event_type,
      delivery_mode: mode,
      start_date,
      end_date,
      location: location || null,
      meeting_link: meeting_link || null,
      poster_image,
      poster_prompt,
      poster_color_palette: poster_color_palette
        ? typeof poster_color_palette === "object"
          ? poster_color_palette
          : { palette: poster_color_palette }
        : null,
      created_by: req.user?.id || null,
      is_published: is_published !== false,
      is_featured: !!is_featured,
      tags: tags || [],
    });

    if (isOnlineDelivery(mode) && !row.live_meeting_id) {
      await row.update(provisionLiveFields(row.id));
      await row.reload();
    }

    return res.status(201).json({ success: true, data: row, poster: posterMeta });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateSchoolEvent = async (req, res) => {
  try {
    const row = await SchoolEvent.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    const allowed = [
      "title",
      "description",
      "event_type",
      "delivery_mode",
      "start_date",
      "end_date",
      "location",
      "meeting_link",
      "poster_image",
      "poster_prompt",
      "poster_color_palette",
      "is_published",
      "is_featured",
      "tags",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }

    if (req.body.slug) patch.slug = await ensureUniqueSlug(SchoolEvent, slugify(req.body.slug), row.id);

    let posterMeta = null;
    if (req.body.generate_poster || req.body.generatePoster) {
      const posterSource = { ...row.get({ plain: true }), ...patch };
      if (!canRegenerateEventPoster(posterSource)) {
        return res.status(403).json({
          success: false,
          message: "Poster cannot be regenerated after the event’s scheduled end time.",
        });
      }
      try {
        const desc =
          req.body.poster_description || patch.description || row.description || row.title;
        const paletteKey =
          req.body.color_palette ||
          req.body.poster_color_palette ||
          row.poster_color_palette?.palette ||
          "festive";
        posterMeta = await PosterGenerator.generatePoster(desc, "event", paletteKey, "event");
        patch.poster_image = posterMeta.imageUrl;
        patch.poster_prompt = posterMeta.prompt;
      } catch (e) {
        return res.status(502).json({ success: false, message: e.message || "Poster generation failed" });
      }
    }

    await row.update(patch);
    await row.reload();

    const nextMode = patch.delivery_mode || row.delivery_mode;
    if (isOnlineDelivery(nextMode) && !row.live_meeting_id) {
      await row.update(provisionLiveFields(row.id));
      await row.reload();
    }

    return res.json({ success: true, data: row, poster: posterMeta });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.generatePosterForEvent = async (req, res) => {
  try {
    const row = await SchoolEvent.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    if (!canRegenerateEventPoster(row)) {
      return res.status(403).json({
        success: false,
        message: "Poster cannot be regenerated after the event’s scheduled end time.",
      });
    }

    const desc =
      req.body.poster_description || req.body.description || row.description || row.title;
    const paletteKey =
      req.body.color_palette || row.poster_color_palette?.palette || "festive";

    let posterMeta;
    try {
      posterMeta = await PosterGenerator.generatePoster(desc, "event", paletteKey, "event");
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

exports.deleteSchoolEvent = async (req, res) => {
  try {
    const row = await SchoolEvent.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
