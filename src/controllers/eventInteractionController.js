const { EventLiveChat, EventLiveReaction, EventLiveHandRaise, EventLobbyEntry, User } = require("../models");
const {
  loadEventForLive,
  assertCanAccessEventLive,
  isEventStaff,
} = require("../services/eventLiveAccess");
const { emitToEvent } = require("../services/eventRealtime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatChatRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    event_id: j.event_id,
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
          role: j.author.role,
        }
      : null,
    replies: Array.isArray(j.replies) ? j.replies.map((r) => formatChatRow(r)) : [],
  };
}

const chatIncludes = [
  { model: User, as: "author", ...userSafe },
  {
    model: EventLiveChat,
    as: "replies",
    required: false,
    separate: true,
    include: [{ model: User, as: "author", ...userSafe }],
    order: [["sent_at", "ASC"]],
  },
];

async function loadChatForEvent(eventId) {
  const rows = await EventLiveChat.findAll({
    where: { event_id: eventId, parent_id: null },
    include: chatIncludes,
    order: [["sent_at", "ASC"]],
  });
  return rows.map(formatChatRow);
}

function formatHandRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    event_id: j.event_id,
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
          role: j.user.role,
        }
      : null,
  };
}

async function loadActiveHands(eventId) {
  const rows = await EventLiveHandRaise.findAll({
    where: { event_id: eventId, status: "raised" },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["raised_at", "ASC"]],
  });
  return rows.map(formatHandRow);
}

async function loadRecentReactions(eventId) {
  const rows = await EventLiveReaction.findAll({
    where: { event_id: eventId },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["created_at", "ASC"]],
    limit: 50,
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      event_id: j.event_id,
      emoji: j.emoji,
      user_id: j.user_id,
      user_name: j.user?.full_name || j.user?.username || "User",
      at: j.created_at,
    };
  });
}

async function assertCanInteract(req, event) {
  await assertCanAccessEventLive(req, event);
  if (isEventStaff(req)) return;
  const entry = await EventLobbyEntry.findOne({
    where: { event_id: event.id, user_id: req.user.id },
    order: [["requested_at", "DESC"]],
    attributes: ["status"],
  });
  if (!entry || entry.status !== "admitted") {
    const err = new Error("You must be admitted to the event before participating.");
    err.statusCode = 403;
    throw err;
  }
}

exports.getEventInteractions = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const [chat, raised_hands, reactions] = await Promise.all([
      loadChatForEvent(event.id),
      loadActiveHands(event.id),
      loadRecentReactions(event.id),
    ]);

    return res.json({ success: true, data: { chat, raised_hands, reactions } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postEventChat = async (req, res) => {
  try {
    const message = req.body?.message != null ? String(req.body.message).trim() : "";
    const isQuestion = !!req.body?.is_question;
    const parentId = req.body?.parent_id != null ? String(req.body.parent_id).trim() : "";

    if (!message) {
      return res.status(400).json({ success: false, message: "message is required" });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanInteract(req, event);

    if (parentId && !isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can reply in threads" });
    }

    if (parentId) {
      const parent = await EventLiveChat.findOne({
        where: { id: parentId, event_id: event.id },
      });
      if (!parent) {
        return res.status(404).json({ success: false, message: "Parent message not found" });
      }
    }

    const row = await EventLiveChat.create({
      event_id: event.id,
      user_id: req.user.id,
      message,
      is_question: parentId ? false : isQuestion,
      is_answered: false,
      parent_id: parentId || null,
      sent_at: new Date(),
    });

    if (parentId) {
      await EventLiveChat.update({ is_answered: true }, { where: { id: parentId } });
    }

    const created = await EventLiveChat.findByPk(row.id, {
      include: parentId
        ? [{ model: User, as: "author", ...userSafe }]
        : chatIncludes,
    });

    const payload = formatChatRow(created);
    emitToEvent(event.id, "event-chat:new", { message: payload, event_id: event.id });

    if (parentId) {
      const chat = await loadChatForEvent(event.id);
      emitToEvent(event.id, "event-chat:sync", { chat, event_id: event.id });
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.markEventQuestionAnswered = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can mark questions answered" });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const row = await EventLiveChat.findOne({
      where: {
        id: req.params.messageId,
        event_id: event.id,
        parent_id: null,
        is_question: true,
      },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    await row.update({ is_answered: true });
    const chat = await loadChatForEvent(event.id);
    emitToEvent(event.id, "event-chat:sync", { chat, event_id: event.id });

    return res.json({ success: true, data: { id: row.id, is_answered: true } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.raiseEventHand = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanInteract(req, event);

    const now = new Date();
    let row = await EventLiveHandRaise.findOne({
      where: { event_id: event.id, user_id: req.user.id, status: "raised" },
    });

    if (!row) {
      row = await EventLiveHandRaise.create({
        event_id: event.id,
        user_id: req.user.id,
        status: "raised",
        raised_at: now,
      });
    } else {
      await row.update({ raised_at: now });
    }

    const full = await EventLiveHandRaise.findByPk(row.id, {
      include: [{ model: User, as: "user", ...userSafe }],
    });
    const raised_hands = await loadActiveHands(event.id);
    emitToEvent(event.id, "event-hand:update", { raised_hands, event_id: event.id });

    return res.json({ success: true, data: formatHandRow(full) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.lowerEventHand = async (req, res) => {
  try {
    const event = await loadEventForLive(req.params.id);
    await assertCanInteract(req, event);

    const row = await EventLiveHandRaise.findOne({
      where: { event_id: event.id, user_id: req.user.id, status: "raised" },
    });
    if (!row) {
      return res.json({ success: true, data: null });
    }

    await row.update({ status: "lowered", lowered_at: new Date() });
    const raised_hands = await loadActiveHands(event.id);
    emitToEvent(event.id, "event-hand:update", { raised_hands, event_id: event.id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.dismissEventHand = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can dismiss raised hands" });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanAccessEventLive(req, event);

    const row = await EventLiveHandRaise.findOne({
      where: { id: req.params.handId, event_id: event.id, status: "raised" },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Raised hand not found" });
    }

    await row.update({
      status: "dismissed",
      dismissed_at: new Date(),
      dismissed_by: req.user.id,
    });

    const raised_hands = await loadActiveHands(event.id);
    emitToEvent(event.id, "event-hand:update", { raised_hands, event_id: event.id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postEventReaction = async (req, res) => {
  try {
    const emoji = req.body?.emoji != null ? String(req.body.emoji).trim() : "";
    if (!emoji || emoji.length > 8) {
      return res.status(400).json({ success: false, message: "emoji is required" });
    }

    const event = await loadEventForLive(req.params.id);
    await assertCanInteract(req, event);

    const row = await EventLiveReaction.create({
      event_id: event.id,
      user_id: req.user.id,
      emoji,
    });
    await row.reload({ include: [{ model: User, as: "user", ...userSafe }] });

    const payload = {
      event_id: event.id,
      emoji,
      user_id: req.user.id,
      user_name: row.user?.full_name || row.user?.username || "User",
      at: row.created_at,
    };

    emitToEvent(event.id, "event-reaction", payload);
    return res.json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
