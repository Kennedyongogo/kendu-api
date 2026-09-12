const path = require("path");
const fs = require("fs");
const {
  Op,
  STAFF_ROLES,
  StaffChat,
  StaffChatMember,
  StaffChatMessage,
  StaffChatAttachment,
  User,
  directKey,
  serializeUser,
  serializeMessage,
  chatTitle,
  chatPeer,
  assertMember,
  loadChatForUser,
  setTyping,
  clearTyping,
  getTypingUsers,
} = require("../services/staffChatService");

function unlinkFile(filename) {
  if (!filename || /^https?:\/\//i.test(filename)) return;
  const filePath = path.join(__dirname, "..", "..", "uploads", "staff-chat", filename);
  fs.unlink(filePath, () => {});
}

const messageInclude = [
  {
    model: User,
    as: "author",
    attributes: ["id", "full_name", "role", "position", "profile_image"],
  },
  { model: StaffChatAttachment, as: "attachments" },
];

async function latestMessageMap(chatIds) {
  const map = new Map();
  if (!chatIds.length) return map;
  const messages = await StaffChatMessage.findAll({
    where: { chat_id: { [Op.in]: chatIds } },
    include: messageInclude,
    order: [["created_at", "DESC"]],
  });
  for (const msg of messages) {
    if (!map.has(msg.chat_id)) map.set(msg.chat_id, msg);
  }
  return map;
}

async function unreadCountMap(chatIds, userId, memberships) {
  const map = new Map();
  for (const chatId of chatIds) map.set(chatId, 0);
  if (!chatIds.length) return map;

  const membershipByChat = new Map(memberships.map((m) => [m.chat_id, m]));

  for (const chatId of chatIds) {
    const membership = membershipByChat.get(chatId);
    const where = {
      chat_id: chatId,
      user_id: { [Op.ne]: userId },
    };
    if (membership?.last_read_at) {
      where.created_at = { [Op.gt]: membership.last_read_at };
    }
    map.set(chatId, await StaffChatMessage.count({ where }));
  }
  return map;
}

function serializeChatListItem(chat, viewerId, latest, unread) {
  const plain = chat.get ? chat.get({ plain: true }) : chat;
  return {
    id: plain.id,
    type: plain.type,
    name: chatTitle(plain, viewerId),
    peer: chatPeer(plain, viewerId),
    members: (plain.members || []).map((m) => serializeUser(m.user)),
    member_count: (plain.members || []).length,
    latest_message: latest ? serializeMessage(latest) : null,
    unread_count: unread || 0,
    updated_at: latest?.created_at || plain.updated_at || plain.created_at,
  };
}

/** GET /contacts — other admin/staff for starting a chat */
exports.listContacts = async (req, res) => {
  try {
    const q = String(req.query.search || "").trim();
    const where = {
      role: { [Op.in]: STAFF_ROLES },
      is_active: true,
      id: { [Op.ne]: req.user.id },
    };
    if (q) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { position: { [Op.iLike]: `%${q}%` } },
      ];
    }
    const contacts = await User.findAll({
      where,
      attributes: ["id", "full_name", "role", "position", "profile_image", "email"],
      order: [["full_name", "ASC"]],
      limit: 200,
    });
    res.json({ contacts: contacts.map(serializeUser) });
  } catch (error) {
    console.error("listContacts:", error);
    res.status(500).json({ error: "Failed to load contacts" });
  }
};

/** GET /chats */
exports.listChats = async (req, res) => {
  try {
    const memberships = await StaffChatMember.findAll({
      where: { user_id: req.user.id },
    });
    const chatIds = memberships.map((m) => m.chat_id);
    if (!chatIds.length) return res.json({ chats: [] });

    const chats = await StaffChat.findAll({
      where: { id: { [Op.in]: chatIds } },
      include: [
        {
          model: StaffChatMember,
          as: "members",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "full_name", "role", "position", "profile_image"],
            },
          ],
        },
      ],
    });

    const latestMap = await latestMessageMap(chatIds);
    const unreadMap = await unreadCountMap(chatIds, req.user.id, memberships);

    // Only list chats that have at least one message (empty DMs stay out of the inbox)
    const items = chats
      .map((chat) =>
        serializeChatListItem(
          chat,
          req.user.id,
          latestMap.get(chat.id),
          unreadMap.get(chat.id) || 0
        )
      )
      .filter((item) => item.type === "group" || item.latest_message)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({ chats: items });
  } catch (error) {
    console.error("listChats:", error);
    res.status(500).json({ error: "Failed to load chats" });
  }
};

/** POST /chats/direct { user_id } */
exports.openDirectChat = async (req, res) => {
  try {
    const peerId = String(req.body.user_id || "").trim();
    if (!peerId) return res.status(400).json({ error: "user_id is required" });
    if (peerId === req.user.id) {
      return res.status(400).json({ error: "Cannot chat with yourself" });
    }

    const peer = await User.findOne({
      where: { id: peerId, role: { [Op.in]: STAFF_ROLES }, is_active: true },
    });
    if (!peer) return res.status(404).json({ error: "Staff member not found" });

    const key = directKey(req.user.id, peerId);
    let chat = await StaffChat.findOne({
      where: { type: "direct", direct_key: key },
      include: [
        {
          model: StaffChatMember,
          as: "members",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "full_name", "role", "position", "profile_image"],
            },
          ],
        },
      ],
    });

    if (!chat) {
      chat = await StaffChat.create({
        type: "direct",
        name: null,
        direct_key: key,
        created_by: req.user.id,
      });
      await StaffChatMember.bulkCreate([
        { chat_id: chat.id, user_id: req.user.id, last_read_at: new Date() },
        { chat_id: chat.id, user_id: peerId, last_read_at: null },
      ]);
      chat = await loadChatForUser(chat.id, req.user.id);
    }

    res.json({
      chat: serializeChatListItem(chat, req.user.id, null, 0),
    });
  } catch (error) {
    console.error("openDirectChat:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to open chat" });
  }
};

/** POST /chats/group { name, member_ids[], all_staff? } */
exports.createGroupChat = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Group name is required" });

    let memberIds = Array.isArray(req.body.member_ids)
      ? req.body.member_ids.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (req.body.all_staff === true || req.body.all_staff === "true") {
      const all = await User.findAll({
        where: {
          role: { [Op.in]: STAFF_ROLES },
          is_active: true,
          id: { [Op.ne]: req.user.id },
        },
        attributes: ["id"],
      });
      memberIds = all.map((u) => u.id);
    }

    memberIds = [...new Set(memberIds.filter((id) => id !== req.user.id))];
    if (!memberIds.length) {
      return res.status(400).json({ error: "Add at least one other member" });
    }

    const validMembers = await User.findAll({
      where: {
        id: { [Op.in]: memberIds },
        role: { [Op.in]: STAFF_ROLES },
        is_active: true,
      },
      attributes: ["id"],
    });
    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({ error: "One or more members are invalid" });
    }

    const chat = await StaffChat.create({
      type: "group",
      name: name.slice(0, 120),
      direct_key: null,
      created_by: req.user.id,
    });

    await StaffChatMember.bulkCreate([
      { chat_id: chat.id, user_id: req.user.id, last_read_at: new Date() },
      ...validMembers.map((u) => ({
        chat_id: chat.id,
        user_id: u.id,
        last_read_at: null,
      })),
    ]);

    const full = await loadChatForUser(chat.id, req.user.id);
    res.status(201).json({
      chat: serializeChatListItem(full, req.user.id, null, 0),
    });
  } catch (error) {
    console.error("createGroupChat:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to create group" });
  }
};

/** GET /chats/:id */
exports.getChat = async (req, res) => {
  try {
    const chat = await loadChatForUser(req.params.id, req.user.id);
    const latestMap = await latestMessageMap([chat.id]);
    const membership = await StaffChatMember.findOne({
      where: { chat_id: chat.id, user_id: req.user.id },
    });
    const unreadMap = await unreadCountMap([chat.id], req.user.id, [membership]);
    res.json({
      chat: serializeChatListItem(
        chat,
        req.user.id,
        latestMap.get(chat.id),
        unreadMap.get(chat.id) || 0
      ),
    });
  } catch (error) {
    console.error("getChat:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to load chat" });
  }
};

/** GET /chats/:id/messages */
exports.listMessages = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const before = req.query.before ? new Date(req.query.before) : null;

    const where = { chat_id: req.params.id };
    if (before && !Number.isNaN(before.getTime())) {
      where.created_at = { [Op.lt]: before };
    }

    const rows = await StaffChatMessage.findAll({
      where,
      include: messageInclude,
      order: [["created_at", "DESC"]],
      limit,
    });

    const messages = rows.reverse().map(serializeMessage);
    res.json({ messages, has_more: rows.length === limit });
  } catch (error) {
    console.error("listMessages:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to load messages" });
  }
};

/** POST /chats/:id/messages — multipart: body + files[] */
exports.postMessage = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    const body = String(req.body.body || "").trim().slice(0, 4000);
    const files = Array.isArray(req.files) ? req.files : [];

    if (!body && !files.length) {
      return res.status(400).json({ error: "Message text or attachment required" });
    }

    const message = await StaffChatMessage.create({
      chat_id: req.params.id,
      user_id: req.user.id,
      body: body || null,
    });

    if (files.length) {
      await StaffChatAttachment.bulkCreate(
        files.map((file) => ({
          message_id: message.id,
          filename: file.filename,
          original_name: file.originalname || file.filename,
          mime_type: file.mimetype || null,
          file_size: file.size || null,
        }))
      );
    }

    await StaffChatMember.update(
      { last_read_at: new Date() },
      { where: { chat_id: req.params.id, user_id: req.user.id } }
    );
    await StaffChat.update(
      { updated_at: new Date() },
      { where: { id: req.params.id } }
    );
    clearTyping(req.params.id, req.user.id);

    const full = await StaffChatMessage.findByPk(message.id, { include: messageInclude });
    const serialized = serializeMessage(full);

    try {
      const { emitChatMessage, emitToUsers } = require("../realtime/staffChatSocket");
      emitChatMessage(req.params.id, serialized);
      const members = await StaffChatMember.findAll({
        where: { chat_id: req.params.id },
        attributes: ["user_id"],
      });
      emitToUsers(
        members.map((m) => m.user_id),
        "chat:inbox",
        { chat_id: req.params.id, message: serialized }
      );
    } catch (emitErr) {
      console.warn("socket emit skipped:", emitErr.message);
    }

    res.status(201).json({ message: serialized });
  } catch (error) {
    console.error("postMessage:", error);
    (req.files || []).forEach((f) => unlinkFile(f.filename));
    res.status(error.status || 500).json({ error: error.message || "Failed to send message" });
  }
};

/** POST /chats/:id/read */
exports.markRead = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    await StaffChatMember.update(
      { last_read_at: new Date() },
      { where: { chat_id: req.params.id, user_id: req.user.id } }
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("markRead:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to mark read" });
  }
};

/** POST /chats/:id/typing — heartbeat while composing (HTTP fallback) */
exports.signalTyping = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    setTyping(req.params.id, req.user);
    try {
      const { getIO, chatRoom } = require("../realtime/staffChatSocket");
      const io = getIO();
      if (io) {
        io.to(chatRoom(req.params.id)).emit("chat:typing", {
          chat_id: req.params.id,
          typing: getTypingUsers(req.params.id, null),
        });
      }
    } catch {
      /* sockets optional */
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("signalTyping:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to signal typing" });
  }
};

/** GET /chats/:id/typing — who else is typing right now */
exports.listTyping = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    res.json({ typing: getTypingUsers(req.params.id, req.user.id) });
  } catch (error) {
    console.error("listTyping:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to load typing" });
  }
};

/** DELETE /chats/:id/messages/:messageId */
exports.deleteMessage = async (req, res) => {
  try {
    await assertMember(req.params.id, req.user.id);
    const message = await StaffChatMessage.findOne({
      where: { id: req.params.messageId, chat_id: req.params.id },
      include: [{ model: StaffChatAttachment, as: "attachments" }],
    });
    if (!message) return res.status(404).json({ error: "Message not found" });

    const isOwner = message.user_id === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Cannot delete this message" });
    }

    for (const att of message.attachments || []) {
      unlinkFile(att.filename);
    }
    await StaffChatAttachment.destroy({ where: { message_id: message.id } });
    await message.destroy();
    res.json({ ok: true });
  } catch (error) {
    console.error("deleteMessage:", error);
    res.status(error.status || 500).json({ error: error.message || "Failed to delete message" });
  }
};
