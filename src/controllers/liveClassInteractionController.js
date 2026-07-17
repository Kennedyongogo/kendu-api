const { Op } = require("sequelize");
const { LiveClassChat, LiveClassHandRaise, LiveClassReaction, User } = require("../models");
const {
  loadLiveClassForAccess,
  assertCanAccessLiveClass,
  isTeacherRole,
} = require("../services/liveClassAccess");
const { emitToLiveClass } = require("../services/liveClassRealtime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatChatRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    live_class_id: j.live_class_id,
    user_id: j.user_id,
    message: j.message,
    sent_at: j.sent_at,
    is_question: !!j.is_question,
    is_answered: !!j.is_answered,
    parent_id: j.parent_id || null,
    author: j.author
      ? {
          id: j.author.id,
          full_name: j.author.full_name,
          username: j.author.username,
        }
      : null,
    replies: Array.isArray(j.replies)
      ? j.replies.map((r) => formatChatRow(r))
      : [],
  };
}

function formatHandRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    live_class_id: j.live_class_id,
    user_id: j.user_id,
    status: j.status,
    raised_at: j.raised_at,
    lowered_at: j.lowered_at,
    dismissed_at: j.dismissed_at,
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
        }
      : null,
  };
}

const chatIncludes = [
  { model: User, as: "author", ...userSafe },
  {
    model: LiveClassChat,
    as: "replies",
    required: false,
    include: [{ model: User, as: "author", ...userSafe }],
    order: [["sent_at", "ASC"]],
  },
];

async function loadChatForRoom(liveClassId) {
  const rows = await LiveClassChat.findAll({
    where: { live_class_id: liveClassId, parent_id: null },
    include: [
      { model: User, as: "author", ...userSafe },
      {
        model: LiveClassChat,
        as: "replies",
        required: false,
        separate: true,
        include: [{ model: User, as: "author", ...userSafe }],
        order: [["sent_at", "ASC"]],
      },
    ],
    order: [["sent_at", "ASC"]],
  });
  return rows.map(formatChatRow);
}

async function loadActiveHands(liveClassId) {
  const rows = await LiveClassHandRaise.findAll({
    where: { live_class_id: liveClassId, status: "raised" },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["raised_at", "ASC"]],
  });
  return rows.map(formatHandRow);
}

const REACTIONS_RECENT_LIMIT = 50;

async function loadRecentReactions(liveClassId) {
  const rows = await LiveClassReaction.findAll({
    where: { live_class_id: liveClassId },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["created_at", "ASC"]],
    limit: REACTIONS_RECENT_LIMIT,
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      live_class_id: j.live_class_id,
      emoji: j.emoji,
      user_id: j.user_id,
      user_name: j.user?.full_name || j.user?.username || "User",
      at: j.created_at,
    };
  });
}

exports.getLiveClassInteractions = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const [chat, raised_hands, reactions] = await Promise.all([
      loadChatForRoom(id),
      loadActiveHands(id),
      loadRecentReactions(id),
    ]);

    return res.json({
      success: true,
      data: { chat, raised_hands, reactions },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postLiveClassChat = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const message = body.message != null ? String(body.message).trim() : "";
    const isQuestion = !!body.is_question;
    const parentId = body.parent_id != null ? String(body.parent_id).trim() : "";

    if (!message) {
      return res.status(400).json({ success: false, message: "message is required" });
    }
    if (message.length > 4000) {
      return res.status(400).json({ success: false, message: "message is too long (max 4000)" });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    if (parentId) {
      if (!isTeacherRole(req)) {
        return res.status(403).json({ success: false, message: "Only staff can reply in threads" });
      }
      const parent = await LiveClassChat.findOne({
        where: { id: parentId, live_class_id: id },
      });
      if (!parent) {
        return res.status(404).json({ success: false, message: "Parent message not found" });
      }
    } else if (isQuestion && isTeacherRole(req)) {
      return res.status(400).json({ success: false, message: "Use normal chat or reply to a student question" });
    }

    const row = await LiveClassChat.create({
      live_class_id: id,
      user_id: req.user.id,
      message,
      is_question: parentId ? false : isQuestion,
      is_answered: false,
      parent_id: parentId || null,
      sent_at: new Date(),
    });

    if (parentId) {
      await LiveClassChat.update({ is_answered: true }, { where: { id: parentId } });
    }

    const created = await LiveClassChat.findByPk(row.id, {
      include: parentId
        ? [{ model: User, as: "author", ...userSafe }]
        : chatIncludes,
    });

    const payload = formatChatRow(created);
    emitToLiveClass(id, "live-chat:new", { message: payload, live_class_id: id });

    if (parentId) {
      const chat = await loadChatForRoom(id);
      emitToLiveClass(id, "live-chat:sync", { chat, live_class_id: id });
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.markLiveClassQuestionAnswered = async (req, res) => {
  try {
    const { id, messageId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can mark questions answered" });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const row = await LiveClassChat.findOne({
      where: { id: messageId, live_class_id: id, parent_id: null, is_question: true },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    await row.update({ is_answered: true });
    const chat = await loadChatForRoom(id);
    emitToLiveClass(id, "live-chat:sync", { chat, live_class_id: id });

    return res.json({ success: true, data: { id: row.id, is_answered: true } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.raiseHand = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const now = new Date();
    let row = await LiveClassHandRaise.findOne({
      where: { live_class_id: id, user_id: req.user.id, status: "raised" },
    });

    if (!row) {
      row = await LiveClassHandRaise.create({
        live_class_id: id,
        user_id: req.user.id,
        status: "raised",
        raised_at: now,
      });
    } else {
      await row.update({ raised_at: now });
    }

    const full = await LiveClassHandRaise.findByPk(row.id, {
      include: [{ model: User, as: "user", ...userSafe }],
    });
    const raised_hands = await loadActiveHands(id);
    emitToLiveClass(id, "live-hand:update", { raised_hands, live_class_id: id });

    return res.json({ success: true, data: formatHandRow(full) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.lowerHand = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const row = await LiveClassHandRaise.findOne({
      where: { live_class_id: id, user_id: req.user.id, status: "raised" },
    });
    if (!row) {
      return res.json({ success: true, data: null });
    }

    await row.update({ status: "lowered", lowered_at: new Date() });
    const raised_hands = await loadActiveHands(id);
    emitToLiveClass(id, "live-hand:update", { raised_hands, live_class_id: id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.dismissHand = async (req, res) => {
  try {
    const { id, handId } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can dismiss raised hands" });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const row = await LiveClassHandRaise.findOne({
      where: { id: handId, live_class_id: id, status: "raised" },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Raised hand not found" });
    }

    await row.update({
      status: "dismissed",
      dismissed_at: new Date(),
      dismissed_by: req.user.id,
    });

    const raised_hands = await loadActiveHands(id);
    emitToLiveClass(id, "live-hand:update", { raised_hands, live_class_id: id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postLiveClassReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const emoji = req.body?.emoji != null ? String(req.body.emoji).trim() : "";
    if (!emoji || emoji.length > 8) {
      return res.status(400).json({ success: false, message: "emoji is required" });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const row = await LiveClassReaction.create({
      live_class_id: id,
      user_id: req.user.id,
      emoji,
    });
    await row.reload({ include: [{ model: User, as: "user", ...userSafe }] });

    const payload = {
      live_class_id: id,
      emoji,
      user_id: req.user.id,
      user_name: row.user?.full_name || row.user?.username || req.user.full_name || req.user.username || "User",
      at: row.created_at,
    };

    emitToLiveClass(id, "live-reaction", payload);

    return res.json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
