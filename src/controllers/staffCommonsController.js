const path = require("path");
const fs = require("fs");
const {
  isAdmin,
  briefingVisibilityWhere,
  canAccessChannel,
  canPostInChannel,
  ensureStaffChannels,
  serializeBriefing,
  serializeMessage,
  attachmentUrl,
  StaffChannel,
  StaffBriefing,
  StaffBriefingAttachment,
  StaffBriefingRead,
  StaffChannelMessage,
  User,
  Department,
  Op,
} = require("../services/staffCommonsService");

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

function autoExcerpt(body, provided) {
  const clean = toNullableString(provided);
  if (clean) return clean.slice(0, 500);
  const text = toNullableString(body);
  if (!text) return null;
  const stripped = text.replace(/\s+/g, " ").trim();
  return stripped.length > 200 ? `${stripped.slice(0, 197)}…` : stripped;
}

function unlinkAttachment(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "staff-commons", filename);
  fs.unlink(filePath, () => {});
}

const briefingInclude = [
  { model: User, as: "author", attributes: ["id", "full_name", "role"] },
  { model: Department, as: "department", attributes: ["id", "name", "code"] },
  { model: StaffBriefingAttachment, as: "attachments" },
];

async function attachReadMeta(briefings, userId) {
  const ids = briefings.map((b) => b.id);
  if (!ids.length) return briefings.map((b) => serializeBriefing(b, { is_read: false }));

  const reads = await StaffBriefingRead.findAll({
    where: { briefing_id: { [Op.in]: ids }, user_id: userId },
    attributes: ["briefing_id", "read_at"],
  });
  const readMap = new Map(reads.map((r) => [r.briefing_id, r.read_at]));

  return briefings.map((b) =>
    serializeBriefing(b, {
      is_read: readMap.has(b.id),
      read_at: readMap.get(b.id) || null,
    })
  );
}

/** GET /briefings */
exports.listBriefings = async (req, res) => {
  try {
    await ensureStaffChannels();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;

    const where = {
      is_published: true,
      ...briefingVisibilityWhere(req.user),
    };

    if (isAdmin(req.user)) {
      if (req.query.is_published !== undefined && req.query.is_published !== "") {
        where.is_published = toBool(req.query.is_published, true);
      }
      if (req.query.department_id === "school") {
        where.department_id = null;
      } else if (req.query.department_id) {
        where.department_id = req.query.department_id;
      }
    }

    if (req.query.search) {
      const q = String(req.query.search).trim();
      if (q) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
          [Op.or]: [
            { title: { [Op.iLike]: `%${q}%` } },
            { excerpt: { [Op.iLike]: `%${q}%` } },
            { body: { [Op.iLike]: `%${q}%` } },
          ],
        });
      }
    }

    const { count, rows } = await StaffBriefing.findAndCountAll({
      where,
      include: briefingInclude,
      order: [
        ["is_pinned", "DESC"],
        ["published_at", "DESC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    });

    const data = await attachReadMeta(rows, req.user.id);

    return res.json({
      success: true,
      data,
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

/** GET /briefings/:id */
exports.getBriefing = async (req, res) => {
  try {
    const row = await StaffBriefing.findByPk(req.params.id, { include: briefingInclude });
    if (!row) {
      return res.status(404).json({ success: false, message: "Briefing not found" });
    }

    if (!isAdmin(req.user)) {
      const plain = row.get({ plain: true });
      const allowed =
        plain.department_id === null ||
        (req.user.department_id && plain.department_id === req.user.department_id);
      if (!allowed || !plain.is_published) {
        return res.status(403).json({ success: false, message: "Not allowed to view this briefing" });
      }
    }

    const read = await StaffBriefingRead.findOne({
      where: { briefing_id: row.id, user_id: req.user.id },
    });

    let readStats = null;
    if (isAdmin(req.user) && row.requires_acknowledgement) {
      const totalStaff = await User.count({
        where: {
          role: { [Op.in]: ["admin", "staff"] },
          is_active: true,
          ...(row.department_id
            ? { department_id: row.department_id }
            : {}),
        },
      });
      const readCount = await StaffBriefingRead.count({ where: { briefing_id: row.id } });
      readStats = { read_count: readCount, total_staff: totalStaff };
    }

    return res.json({
      success: true,
      data: serializeBriefing(row, {
        is_read: Boolean(read),
        read_at: read?.read_at || null,
        read_stats: readStats,
      }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /briefings — admin only */
exports.createBriefing = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const title = toNullableString(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const isPublished = toBool(req.body.is_published, true);
    let departmentId = req.body.department_id;
    if (departmentId === "" || departmentId === "school" || departmentId === "null") {
      departmentId = null;
    }

    const row = await StaffBriefing.create({
      title,
      excerpt: autoExcerpt(req.body.body, req.body.excerpt),
      body: toNullableString(req.body.body),
      department_id: departmentId || null,
      is_pinned: toBool(req.body.is_pinned, false),
      is_published: isPublished,
      requires_acknowledgement: toBool(req.body.requires_acknowledgement, false),
      published_at: isPublished ? new Date() : null,
      created_by: req.user.id,
    });

    const files = req.files || [];
    for (const file of files) {
      await StaffBriefingAttachment.create({
        briefing_id: row.id,
        filename: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      });
    }

    const full = await StaffBriefing.findByPk(row.id, { include: briefingInclude });
    return res.status(201).json({ success: true, data: serializeBriefing(full) });
  } catch (error) {
    if (req.files?.length) req.files.forEach((f) => unlinkAttachment(f.filename));
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** PUT /briefings/:id — admin only */
exports.updateBriefing = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const row = await StaffBriefing.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Briefing not found" });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      const title = toNullableString(req.body.title);
      if (!title) return res.status(400).json({ success: false, message: "title cannot be empty" });
      updates.title = title;
    }
    if (req.body.body !== undefined) updates.body = toNullableString(req.body.body);
    if (req.body.excerpt !== undefined || req.body.body !== undefined) {
      updates.excerpt = autoExcerpt(
        req.body.body !== undefined ? req.body.body : row.body,
        req.body.excerpt !== undefined ? req.body.excerpt : row.excerpt
      );
    }
    if (req.body.department_id !== undefined) {
      let departmentId = req.body.department_id;
      if (departmentId === "" || departmentId === "school" || departmentId === "null") {
        departmentId = null;
      }
      updates.department_id = departmentId || null;
    }
    if (req.body.is_pinned !== undefined) updates.is_pinned = toBool(req.body.is_pinned, row.is_pinned);
    if (req.body.requires_acknowledgement !== undefined) {
      updates.requires_acknowledgement = toBool(req.body.requires_acknowledgement, row.requires_acknowledgement);
    }
    if (req.body.is_published !== undefined) {
      const nextPublished = toBool(req.body.is_published, row.is_published);
      updates.is_published = nextPublished;
      if (nextPublished && !row.published_at) updates.published_at = new Date();
      if (!nextPublished) updates.published_at = null;
    }

    await row.update(updates);

    const files = req.files || [];
    for (const file of files) {
      await StaffBriefingAttachment.create({
        briefing_id: row.id,
        filename: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      });
    }

    const full = await StaffBriefing.findByPk(row.id, { include: briefingInclude });
    return res.json({ success: true, data: serializeBriefing(full) });
  } catch (error) {
    if (req.files?.length) req.files.forEach((f) => unlinkAttachment(f.filename));
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /briefings/:id — admin only */
exports.deleteBriefing = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const row = await StaffBriefing.findByPk(req.params.id, {
      include: [{ model: StaffBriefingAttachment, as: "attachments" }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Briefing not found" });
    }

    for (const att of row.attachments || []) {
      unlinkAttachment(att.filename);
    }

    await StaffBriefingRead.destroy({ where: { briefing_id: row.id } });
    await StaffBriefingAttachment.destroy({ where: { briefing_id: row.id } });
    await row.destroy();

    return res.json({ success: true, message: "Briefing deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /briefings/:id/read */
exports.markBriefingRead = async (req, res) => {
  try {
    const row = await StaffBriefing.findByPk(req.params.id);
    if (!row || !row.is_published) {
      return res.status(404).json({ success: false, message: "Briefing not found" });
    }

    if (!isAdmin(req.user)) {
      const allowed =
        row.department_id === null ||
        (req.user.department_id && row.department_id === req.user.department_id);
      if (!allowed) {
        return res.status(403).json({ success: false, message: "Not allowed" });
      }
    }

    const [read] = await StaffBriefingRead.findOrCreate({
      where: { briefing_id: row.id, user_id: req.user.id },
      defaults: { read_at: new Date() },
    });

    return res.json({ success: true, data: { read_at: read.read_at } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /briefings/:id/attachments/:attachmentId — admin */
exports.deleteAttachment = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const att = await StaffBriefingAttachment.findOne({
      where: { id: req.params.attachmentId, briefing_id: req.params.id },
    });
    if (!att) {
      return res.status(404).json({ success: false, message: "Attachment not found" });
    }

    unlinkAttachment(att.filename);
    await att.destroy();
    return res.json({ success: true, message: "Attachment removed" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /resources — downloadable attachments */
exports.listResources = async (req, res) => {
  try {
    const briefingWhere = {
      is_published: true,
      ...briefingVisibilityWhere(req.user),
    };

    const briefings = await StaffBriefing.findAll({
      where: briefingWhere,
      attributes: ["id", "title", "published_at", "department_id"],
      include: [
        { model: Department, as: "department", attributes: ["id", "name"] },
        { model: StaffBriefingAttachment, as: "attachments" },
      ],
      order: [["published_at", "DESC"]],
    });

    const resources = [];
    for (const b of briefings) {
      const plain = b.get({ plain: true });
      for (const att of plain.attachments || []) {
        resources.push({
          id: att.id,
          briefing_id: plain.id,
          briefing_title: plain.title,
          department_name: plain.department?.name || "School-wide",
          published_at: plain.published_at,
          original_name: att.original_name || att.filename,
          mime_type: att.mime_type,
          file_size: att.file_size,
          url: attachmentUrl(att.filename),
          created_at: att.created_at,
        });
      }
    }

    if (req.query.search) {
      const q = String(req.query.search).trim().toLowerCase();
      if (q) {
        return res.json({
          success: true,
          data: resources.filter(
            (r) =>
              r.original_name?.toLowerCase().includes(q) ||
              r.briefing_title?.toLowerCase().includes(q)
          ),
        });
      }
    }

    return res.json({ success: true, data: resources });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /channels */
exports.listChannels = async (req, res) => {
  try {
    await ensureStaffChannels();

    const channels = await StaffChannel.findAll({
      where: { is_active: true },
      include: [{ model: Department, as: "department", attributes: ["id", "name", "code"] }],
      order: [
        ["department_id", "ASC NULLS FIRST"],
        ["name", "ASC"],
      ],
    });

    const accessible = channels.filter((c) => canAccessChannel(req.user, c));

    const channelIds = accessible.map((c) => c.id);
    const latestMessages = channelIds.length
      ? await StaffChannelMessage.findAll({
          where: { channel_id: { [Op.in]: channelIds } },
          include: [{ model: User, as: "author", attributes: ["id", "full_name"] }],
          order: [["created_at", "DESC"]],
        })
      : [];

    const latestByChannel = new Map();
    for (const msg of latestMessages) {
      if (!latestByChannel.has(msg.channel_id)) {
        latestByChannel.set(msg.channel_id, serializeMessage(msg));
      }
    }

    const data = accessible.map((c) => {
      const plain = c.get({ plain: true });
      return {
        ...plain,
        department_name: plain.department?.name || null,
        is_school_wide: !plain.department_id,
        can_post: canPostInChannel(req.user, c),
        latest_message: latestByChannel.get(c.id) || null,
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /channels/:id/messages */
exports.listChannelMessages = async (req, res) => {
  try {
    const channel = await StaffChannel.findByPk(req.params.id);
    if (!channel || !canAccessChannel(req.user, channel)) {
      return res.status(404).json({ success: false, message: "Channel not found" });
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
    const before = req.query.before ? new Date(req.query.before) : null;
    const where = { channel_id: channel.id };
    if (before && !Number.isNaN(before.getTime())) {
      where.created_at = { [Op.lt]: before };
    }

    const rows = await StaffChannelMessage.findAll({
      where,
      include: [{ model: User, as: "author", attributes: ["id", "full_name", "role", "profile_image"] }],
      order: [["created_at", "DESC"]],
      limit,
    });

    return res.json({
      success: true,
      data: rows.reverse().map(serializeMessage),
      meta: { can_post: canPostInChannel(req.user, channel) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** POST /channels/:id/messages */
exports.postChannelMessage = async (req, res) => {
  try {
    const channel = await StaffChannel.findByPk(req.params.id);
    if (!channel || !canAccessChannel(req.user, channel)) {
      return res.status(404).json({ success: false, message: "Channel not found" });
    }
    if (!canPostInChannel(req.user, channel)) {
      return res.status(403).json({ success: false, message: "You cannot post in this channel" });
    }

    const body = toNullableString(req.body.body);
    if (!body) {
      return res.status(400).json({ success: false, message: "Message cannot be empty" });
    }

    const row = await StaffChannelMessage.create({
      channel_id: channel.id,
      user_id: req.user.id,
      body: body.slice(0, 4000),
    });

    const full = await StaffChannelMessage.findByPk(row.id, {
      include: [{ model: User, as: "author", attributes: ["id", "full_name", "role"] }],
    });

    return res.status(201).json({ success: true, data: serializeMessage(full) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** DELETE /channels/:id/messages/:messageId — admin or own message */
exports.deleteChannelMessage = async (req, res) => {
  try {
    const msg = await StaffChannelMessage.findByPk(req.params.messageId);
    if (!msg || msg.channel_id !== req.params.id) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (!isAdmin(req.user) && msg.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    await msg.destroy();
    return res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /overview — stats for hero */
exports.getOverview = async (req, res) => {
  try {
    await ensureStaffChannels();

    const briefingWhere = {
      is_published: true,
      ...briefingVisibilityWhere(req.user),
    };

    const briefings = await StaffBriefing.findAll({
      where: briefingWhere,
      attributes: ["id"],
      include: [{ model: StaffBriefingAttachment, as: "attachments", attributes: ["id"] }],
    });

    const ids = briefings.map((b) => b.id);
    let unread = 0;
    if (ids.length) {
      const readCount = await StaffBriefingRead.count({
        where: { user_id: req.user.id, briefing_id: { [Op.in]: ids } },
      });
      unread = Math.max(0, ids.length - readCount);
    }

    let resourceTotal = 0;
    for (const b of briefings) {
      resourceTotal += (b.attachments || []).length;
    }

    const channels = await StaffChannel.findAll({
      where: { is_active: true },
      include: [{ model: Department, as: "department", attributes: ["id", "name"] }],
    });
    const accessibleChannels = channels.filter((c) => canAccessChannel(req.user, c));

    return res.json({
      success: true,
      data: {
        briefings: ids.length,
        unread_briefings: unread,
        resources: resourceTotal,
        channels: accessibleChannels.length,
        is_admin: isAdmin(req.user),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
