const { Op } = require("sequelize");
const {
  StaffChat,
  StaffChatMember,
  StaffChatMessage,
  StaffChatAttachment,
  User,
} = require("../models");

const STAFF_ROLES = ["admin", "staff"];

function attachmentUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) {
    return filename;
  }
  return `/uploads/staff-chat/${filename}`;
}

function directKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(":");
}

function serializeUser(user) {
  if (!user) return null;
  const plain = user.get ? user.get({ plain: true }) : user;
  return {
    id: plain.id,
    full_name: plain.full_name,
    role: plain.role,
    position: plain.position || null,
    profile_image: plain.profile_image || null,
  };
}

function serializeAttachment(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    filename: plain.filename,
    original_name: plain.original_name,
    mime_type: plain.mime_type,
    file_size: plain.file_size,
    url: attachmentUrl(plain.filename),
  };
}

function serializeMessage(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  return {
    id: plain.id,
    chat_id: plain.chat_id,
    body: plain.body || "",
    created_at: plain.created_at,
    author: serializeUser(plain.author),
    attachments: (plain.attachments || []).map(serializeAttachment),
  };
}

function chatTitle(chat, viewerId) {
  if (chat.type === "group") return chat.name || "Group";
  const peer = (chat.members || [])
    .map((m) => m.user || m)
    .find((u) => u && u.id !== viewerId);
  return peer?.full_name || "Chat";
}

function chatPeer(chat, viewerId) {
  if (chat.type !== "direct") return null;
  const member = (chat.members || []).find((m) => {
    const uid = m.user_id || m.user?.id;
    return uid && uid !== viewerId;
  });
  return serializeUser(member?.user || null);
}

async function assertMember(chatId, userId) {
  const membership = await StaffChatMember.findOne({
    where: { chat_id: chatId, user_id: userId },
  });
  if (!membership) {
    const err = new Error("You are not in this chat");
    err.status = 403;
    throw err;
  }
  return membership;
}

async function loadChatForUser(chatId, userId) {
  const chat = await StaffChat.findByPk(chatId, {
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
    const err = new Error("Chat not found");
    err.status = 404;
    throw err;
  }
  const isMember = (chat.members || []).some((m) => m.user_id === userId);
  if (!isMember) {
    const err = new Error("You are not in this chat");
    err.status = 403;
    throw err;
  }
  return chat;
}

/** In-memory typing presence: chatId -> Map(userId -> { id, full_name, at }) */
const TYPING_TTL_MS = 3500;
const typingByChat = new Map();

function setTyping(chatId, user) {
  if (!chatId || !user?.id) return;
  let map = typingByChat.get(chatId);
  if (!map) {
    map = new Map();
    typingByChat.set(chatId, map);
  }
  map.set(user.id, {
    id: user.id,
    full_name: user.full_name || "Someone",
    at: Date.now(),
  });
}

function clearTyping(chatId, userId) {
  const map = typingByChat.get(chatId);
  if (!map) return;
  map.delete(userId);
  if (!map.size) typingByChat.delete(chatId);
}

function getTypingUsers(chatId, excludeUserId) {
  const map = typingByChat.get(chatId);
  if (!map) return [];
  const now = Date.now();
  const active = [];
  for (const [uid, entry] of map.entries()) {
    if (now - entry.at > TYPING_TTL_MS) {
      map.delete(uid);
      continue;
    }
    if (excludeUserId && uid === excludeUserId) continue;
    active.push({ id: entry.id, full_name: entry.full_name });
  }
  if (!map.size) typingByChat.delete(chatId);
  return active;
}

module.exports = {
  Op,
  STAFF_ROLES,
  StaffChat,
  StaffChatMember,
  StaffChatMessage,
  StaffChatAttachment,
  User,
  attachmentUrl,
  directKey,
  serializeUser,
  serializeMessage,
  serializeAttachment,
  chatTitle,
  chatPeer,
  assertMember,
  loadChatForUser,
  setTyping,
  clearTyping,
  getTypingUsers,
  TYPING_TTL_MS,
};
