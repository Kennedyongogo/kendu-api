const {
  AdminMeeting,
  AdminMeetingLobbyEntry,
  AdminMeetingLiveChat,
  AdminMeetingLiveReaction,
  User,
} = require("../models");
const {
  dedupeLobbyEntriesByUser,
  buildAttendanceLog,
} = require("../utils/eventAttendanceMinutes");
const { formatEntry } = require("./adminMeetingLobbyService");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatChatRow(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    message: j.message,
    sent_at: j.sent_at,
    is_question: !!j.is_question,
    is_answered: !!j.is_answered,
    parent_id: j.parent_id || null,
    author: j.author
      ? {
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

async function backfillLobbyDurations(meetingId) {
  const rows = await AdminMeetingLobbyEntry.findAll({
    where: { meeting_id: meetingId },
    attributes: ["id", "admitted_at", "left_at", "duration_minutes"],
  });
  for (const row of rows) {
    if (row.duration_minutes != null || !row.admitted_at || !row.left_at) continue;
    const mins = Math.max(
      0,
      Math.round((new Date(row.left_at).getTime() - new Date(row.admitted_at).getTime()) / 60000)
    );
    await row.update({ duration_minutes: mins });
  }
}

async function buildAdminMeetingReport(meetingId) {
  const meeting = await AdminMeeting.findByPk(meetingId, {
    include: [{ model: User, as: "creator", ...userSafe }],
  });
  if (!meeting) {
    const err = new Error("Meeting not found");
    err.statusCode = 404;
    throw err;
  }

  await backfillLobbyDurations(meetingId);

  const lobbyRows = await AdminMeetingLobbyEntry.findAll({
    where: { meeting_id: meetingId },
    include: [
      { model: User, as: "user", ...userSafe },
      { model: User, as: "admitted_by_user", ...userSafe, required: false },
    ],
    order: [["requested_at", "ASC"]],
  });

  const chatRows = await AdminMeetingLiveChat.findAll({
    where: { meeting_id: meetingId, parent_id: null },
    include: chatIncludes,
    order: [["sent_at", "ASC"]],
  });

  const reactionRows = await AdminMeetingLiveReaction.findAll({
    where: { meeting_id: meetingId },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["created_at", "ASC"]],
  });

  const allLobbyVisits = lobbyRows.map((r) => formatEntry(r));
  const attendees = dedupeLobbyEntriesByUser(allLobbyVisits);
  const attendance_log = buildAttendanceLog(allLobbyVisits);
  const chat = chatRows.map(formatChatRow);

  const withAdmission = attendees.filter((a) => a.admitted_at);
  const minutesList = withAdmission.map((a) => a.minutes_in_event).filter((m) => m != null && m > 0);
  const totalMinutes = minutesList.reduce((s, m) => s + m, 0);
  const avgMinutes = minutesList.length > 0 ? Math.round(totalMinutes / minutesList.length) : 0;

  const reactionCounts = {};
  for (const r of reactionRows) {
    const emoji = r.emoji || "?";
    reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
  }

  const questions = chat.filter((m) => m.is_question);
  const answeredQuestions = questions.filter((m) => m.is_answered);

  return {
    generated_at: new Date().toISOString(),
    meeting: {
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      timezone: meeting.timezone,
      status: meeting.status,
      session_status: meeting.session_status,
      live_meeting_id: meeting.live_meeting_id,
      creator: meeting.creator
        ? {
            full_name: meeting.creator.full_name,
            username: meeting.creator.username,
            role: meeting.creator.role,
          }
        : null,
    },
    summary: {
      total_lobby_requests: allLobbyVisits.length,
      unique_participants: attendees.length,
      waiting: allLobbyVisits.filter((a) => a.status === "waiting").length,
      admitted_visits: allLobbyVisits.filter((a) => a.admitted_at).length,
      denied: allLobbyVisits.filter((a) => a.status === "denied").length,
      left_visits: allLobbyVisits.filter((a) => a.status === "left").length,
      participants_with_time: minutesList.length,
      total_minutes_in_event: totalMinutes,
      avg_minutes_in_event: avgMinutes,
      total_chat_messages: chat.filter((m) => !m.is_question).length,
      total_questions: questions.length,
      questions_answered: answeredQuestions.length,
      total_reactions: reactionRows.length,
      reaction_counts: reactionCounts,
    },
    attendees,
    attendance_log,
    chat,
  };
}

module.exports = { buildAdminMeetingReport };
