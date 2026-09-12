const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { User } = require("../models");
const {
  assertMember,
  setTyping,
  clearTyping,
  getTypingUsers,
  STAFF_ROLES,
} = require("../services/staffChatService");

let io = null;

function getIO() {
  return io;
}

function chatRoom(chatId) {
  return `chat:${chatId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

function emitChatMessage(chatId, message) {
  if (!io || !chatId || !message) return;
  io.to(chatRoom(chatId)).emit("chat:message", { chat_id: chatId, message });
  io.to(chatRoom(chatId)).emit("chat:typing", {
    chat_id: chatId,
    typing: getTypingUsers(chatId, null),
  });
}

function emitChatUpdated(chatId, payload = {}) {
  if (!io || !chatId) return;
  io.to(chatRoom(chatId)).emit("chat:updated", { chat_id: chatId, ...payload });
}

/** Notify specific users (e.g. refresh inbox even if not in the room yet) */
function emitToUsers(userIds, event, payload) {
  if (!io || !userIds?.length) return;
  for (const id of userIds) {
    if (id) io.to(userRoom(id)).emit(event, payload);
  }
}

function initStaffChatSocket(httpServer) {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "");

      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded.type !== "user") return next(new Error("Unauthorized"));

      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ["password_hash"] },
      });
      if (!user || !user.is_active) return next(new Error("Unauthorized"));
      if (!STAFF_ROLES.includes(user.role)) {
        return next(new Error("Forbidden"));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.user.id));

    socket.on("chat:join", async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chat_id || payload.chatId || "").trim();
        if (!chatId) throw Object.assign(new Error("chat_id required"), { status: 400 });
        await assertMember(chatId, socket.user.id);
        socket.join(chatRoom(chatId));
        if (typeof ack === "function") ack({ ok: true, chat_id: chatId });
      } catch (err) {
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Failed to join chat" });
        }
      }
    });

    socket.on("chat:leave", (payload = {}) => {
      const chatId = String(payload.chat_id || payload.chatId || "").trim();
      if (chatId) socket.leave(chatRoom(chatId));
    });

    socket.on("chat:typing", async (payload = {}) => {
      try {
        const chatId = String(payload.chat_id || payload.chatId || "").trim();
        if (!chatId) return;
        await assertMember(chatId, socket.user.id);
        setTyping(chatId, socket.user);
        io.to(chatRoom(chatId)).emit("chat:typing", {
          chat_id: chatId,
          typing: getTypingUsers(chatId, null),
        });
      } catch {
        /* ignore */
      }
    });

    socket.on("chat:typing_stop", async (payload = {}) => {
      try {
        const chatId = String(payload.chat_id || payload.chatId || "").trim();
        if (!chatId) return;
        clearTyping(chatId, socket.user.id);
        io.to(chatRoom(chatId)).emit("chat:typing", {
          chat_id: chatId,
          typing: getTypingUsers(chatId, null),
        });
      } catch {
        /* ignore */
      }
    });

    socket.on("disconnect", () => {
      /* typing entries expire via TTL */
    });
  });

  console.log("🔌 Staff chat Socket.IO ready");
  return io;
}

module.exports = {
  initStaffChatSocket,
  getIO,
  emitChatMessage,
  emitChatUpdated,
  emitToUsers,
  chatRoom,
  userRoom,
};
