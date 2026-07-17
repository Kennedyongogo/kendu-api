const {
  AdminMeetingLiveChat,
  AdminMeetingLiveReaction,
  AdminMeetingLiveHandRaise,
  AdminMeetingLobbyEntry,
  User,
} = require("../models");
const {
  loadMeetingForLive,
  assertCanAccessAdminMeeting,
  isMeetingCreator,
} = require("../services/adminMeetingLiveAccess");
const { emitToMeeting } = require("../services/adminMeetingRealtime");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatChatRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    meeting_id: j.meeting_id,
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
    model: AdminMeetingLiveChat,
    as: "replies",
    required: false,
    separate: true,
    include: [{ model: User, as: "author", ...userSafe }],
    order: [["sent_at", "ASC"]],
  },
];

async function loadChatForMeeting(meetingId) {
  const rows = await AdminMeetingLiveChat.findAll({
    where: { meeting_id: meetingId, parent_id: null },
    include: chatIncludes,
    order: [["sent_at", "ASC"]],
  });
  return rows.map(formatChatRow);
}

function formatHandRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    meeting_id: j.meeting_id,
    user_id: j.user_id,
    status: j.status,
    raised_at: j.raised_at,
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

async function loadActiveHands(meetingId) {
  const rows = await AdminMeetingLiveHandRaise.findAll({
    where: { meeting_id: meetingId, status: "raised" },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["raised_at", "ASC"]],
  });
  return rows.map(formatHandRow);
}

async function loadRecentReactions(meetingId) {
  const rows = await AdminMeetingLiveReaction.findAll({
    where: { meeting_id: meetingId },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["created_at", "ASC"]],
    limit: 50,
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      meeting_id: j.meeting_id,
      emoji: j.emoji,
      user_id: j.user_id,
      user_name: j.user?.full_name || j.user?.username || "User",
      at: j.created_at,
    };
  });
}

async function assertCanInteract(req, meeting) {
  await assertCanAccessAdminMeeting(req, meeting);
  if (isMeetingCreator(req, meeting)) return;
  const entry = await AdminMeetingLobbyEntry.findOne({
    where: { meeting_id: meeting.id, user_id: req.user.id },
    order: [["requested_at", "DESC"]],
    attributes: ["status"],
  });
  if (!entry || entry.status !== "admitted" || entry.left_at) {
    const err = new Error("You must be admitted by the host before participating.");
    err.statusCode = 403;
    throw err;
  }
  const session = String(meeting.session_status || "").toLowerCase();
  if (session === "ended" || session === "cancelled") {
    const err = new Error("This meeting has ended.");
    err.statusCode = 403;
    throw err;
  }
}

exports.getAdminMeetingInteractions = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanAccessAdminMeeting(req, meeting);

    const [chat, raised_hands, reactions] = await Promise.all([
      loadChatForMeeting(meeting.id),
      loadActiveHands(meeting.id),
      loadRecentReactions(meeting.id),
    ]);

    return res.json({ success: true, data: { chat, raised_hands, reactions } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postAdminMeetingChat = async (req, res) => {
  try {
    const message = req.body?.message != null ? String(req.body.message).trim() : "";
    const isQuestion = !!req.body?.is_question;
    const parentId = req.body?.parent_id != null ? String(req.body.parent_id).trim() : "";

    if (!message) {
      return res.status(400).json({ success: false, message: "message is required" });
    }

    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanInteract(req, meeting);

    if (parentId && !isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting host can reply in threads" });
    }

    if (parentId) {
      const parent = await AdminMeetingLiveChat.findOne({
        where: { id: parentId, meeting_id: meeting.id },
      });
      if (!parent) {
        return res.status(404).json({ success: false, message: "Parent message not found" });
      }
    }

    const row = await AdminMeetingLiveChat.create({
      meeting_id: meeting.id,
      user_id: req.user.id,
      message,
      is_question: parentId ? false : isQuestion,
      is_answered: false,
      parent_id: parentId || null,
      sent_at: new Date(),
    });

    if (parentId) {
      await AdminMeetingLiveChat.update({ is_answered: true }, { where: { id: parentId } });
    }

    const created = await AdminMeetingLiveChat.findByPk(row.id, {
      include: parentId ? [{ model: User, as: "author", ...userSafe }] : chatIncludes,
    });

    const payload = formatChatRow(created);
    emitToMeeting(meeting.id, "admin-meeting-chat:new", { message: payload, meeting_id: meeting.id });

    if (parentId) {
      const chat = await loadChatForMeeting(meeting.id);
      emitToMeeting(meeting.id, "admin-meeting-chat:sync", { chat, meeting_id: meeting.id });
    }

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.markAdminMeetingQuestionAnswered = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting host can mark questions answered" });
    }

    const row = await AdminMeetingLiveChat.findOne({
      where: {
        id: req.params.messageId,
        meeting_id: meeting.id,
        parent_id: null,
        is_question: true,
      },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    await row.update({ is_answered: true });
    const chat = await loadChatForMeeting(meeting.id);
    emitToMeeting(meeting.id, "admin-meeting-chat:sync", { chat, meeting_id: meeting.id });

    return res.json({ success: true, data: { id: row.id, is_answered: true } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.raiseAdminMeetingHand = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanInteract(req, meeting);

    const now = new Date();
    let row = await AdminMeetingLiveHandRaise.findOne({
      where: { meeting_id: meeting.id, user_id: req.user.id, status: "raised" },
    });

    if (!row) {
      row = await AdminMeetingLiveHandRaise.create({
        meeting_id: meeting.id,
        user_id: req.user.id,
        status: "raised",
        raised_at: now,
      });
    } else {
      await row.update({ raised_at: now });
    }

    const full = await AdminMeetingLiveHandRaise.findByPk(row.id, {
      include: [{ model: User, as: "user", ...userSafe }],
    });
    const raised_hands = await loadActiveHands(meeting.id);
    emitToMeeting(meeting.id, "admin-meeting-hand:update", { raised_hands, meeting_id: meeting.id });

    return res.json({ success: true, data: formatHandRow(full) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.lowerAdminMeetingHand = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanInteract(req, meeting);

    const row = await AdminMeetingLiveHandRaise.findOne({
      where: { meeting_id: meeting.id, user_id: req.user.id, status: "raised" },
    });
    if (!row) {
      return res.json({ success: true, data: null });
    }

    await row.update({ status: "lowered", lowered_at: new Date() });
    const raised_hands = await loadActiveHands(meeting.id);
    emitToMeeting(meeting.id, "admin-meeting-hand:update", { raised_hands, meeting_id: meeting.id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.dismissAdminMeetingHand = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({ success: false, message: "Only the meeting host can dismiss raised hands" });
    }

    const row = await AdminMeetingLiveHandRaise.findOne({
      where: { id: req.params.handId, meeting_id: meeting.id, status: "raised" },
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Raised hand not found" });
    }

    await row.update({
      status: "dismissed",
      dismissed_at: new Date(),
      dismissed_by: req.user.id,
    });

    const raised_hands = await loadActiveHands(meeting.id);
    emitToMeeting(meeting.id, "admin-meeting-hand:update", { raised_hands, meeting_id: meeting.id });

    return res.json({ success: true, data: formatHandRow(row) });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postAdminMeetingReaction = async (req, res) => {
  try {
    const emoji = req.body?.emoji != null ? String(req.body.emoji).trim() : "";
    if (!emoji || emoji.length > 8) {
      return res.status(400).json({ success: false, message: "emoji is required" });
    }

    const meeting = await loadMeetingForLive(req.params.id);
    await assertCanInteract(req, meeting);

    const row = await AdminMeetingLiveReaction.create({
      meeting_id: meeting.id,
      user_id: req.user.id,
      emoji,
    });
    await row.reload({ include: [{ model: User, as: "user", ...userSafe }] });

    const payload = {
      meeting_id: meeting.id,
      emoji,
      user_id: req.user.id,
      user_name: row.user?.full_name || row.user?.username || "User",
      at: row.created_at,
    };

    emitToMeeting(meeting.id, "admin-meeting-reaction", payload);
    return res.json({ success: true, data: payload });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
