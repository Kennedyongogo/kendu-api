const {
  SchoolEvent,
  EventLobbyEntry,
  EventLiveChat,
  EventLiveReaction,
  User,
  Student,
} = require("../models");

const { isOnlineDelivery } = require("./eventLiveProvision");
const {
  minutesFromLobbyRow,
  dedupeLobbyEntriesByUser,
  buildAttendanceLog,
} = require("../utils/eventAttendanceMinutes");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function assertOnlineEventReport(event) {
  if (!isOnlineDelivery(event.delivery_mode)) {
    const err = new Error("Reports are only available for online or hybrid events.");
    err.statusCode = 400;
    throw err;
  }
}

function formatLobbyEntry(row) {
  const j = row.toJSON ? row.toJSON() : row;
  const minsInEvent = minutesFromLobbyRow(j);
  return {
    id: j.id,
    status: j.status,
    requested_at: j.requested_at,
    admitted_at: j.admitted_at,
    denied_at: j.denied_at,
    left_at: j.left_at,
    minutes_in_event: minsInEvent,
    user: j.user
      ? {
          id: j.user.id,
          full_name: j.user.full_name,
          username: j.user.username,
          email: j.user.email,
          role: j.user.role,
        }
      : null,
    student: j.student ? { admission_number: j.student.admission_number } : null,
    admitted_by: j.admitted_by_user
      ? {
          full_name: j.admitted_by_user.full_name,
          username: j.admitted_by_user.username,
        }
      : null,
  };
}

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
    model: EventLiveChat,
    as: "replies",
    required: false,
    separate: true,
    include: [{ model: User, as: "author", ...userSafe }],
    order: [["sent_at", "ASC"]],
  },
];

async function backfillLobbyDurations(eventId) {
  const rows = await EventLobbyEntry.findAll({
    where: { event_id: eventId },
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

async function buildEventReport(eventId) {
  const event = await SchoolEvent.findByPk(eventId);
  if (!event) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }
  assertOnlineEventReport(event);
  await backfillLobbyDurations(eventId);

  const lobbyRows = await EventLobbyEntry.findAll({
    where: { event_id: eventId },
    include: [
      { model: User, as: "user", ...userSafe },
      { model: Student, as: "student", attributes: ["id", "admission_number"] },
      { model: User, as: "admitted_by_user", ...userSafe },
    ],
    order: [["requested_at", "ASC"]],
  });

  const chatRows = await EventLiveChat.findAll({
    where: { event_id: eventId, parent_id: null },
    include: chatIncludes,
    order: [["sent_at", "ASC"]],
  });

  const reactionRows = await EventLiveReaction.findAll({
    where: { event_id: eventId },
    include: [{ model: User, as: "user", ...userSafe }],
    order: [["created_at", "ASC"]],
  });

  const allLobbyVisits = lobbyRows.map(formatLobbyEntry);
  const attendees = dedupeLobbyEntriesByUser(allLobbyVisits);
  const attendance_log = buildAttendanceLog(allLobbyVisits);
  const chat = chatRows.map(formatChatRow);

  const withAdmission = attendees.filter((a) => a.admitted_at);
  const minutesList = withAdmission.map((a) => a.minutes_in_event).filter((m) => m != null && m > 0);
  const totalMinutes = minutesList.reduce((s, m) => s + m, 0);
  const avgMinutes =
    minutesList.length > 0 ? Math.round(totalMinutes / minutesList.length) : 0;

  const reactionCounts = {};
  for (const r of reactionRows) {
    const emoji = r.emoji || "?";
    reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
  }

  const questions = chat.filter((m) => m.is_question);
  const answeredQuestions = questions.filter((m) => m.is_answered);

  return {
    generated_at: new Date().toISOString(),
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      event_type: event.event_type,
      delivery_mode: event.delivery_mode,
      start_date: event.start_date,
      end_date: event.end_date,
      location: event.location,
      session_status: event.session_status,
      is_published: event.is_published,
      live_meeting_id: event.live_meeting_id,
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
    reactions: reactionRows.map((r) => {
      const j = r.toJSON ? r.toJSON() : r;
      return {
        emoji: j.emoji,
        at: j.created_at,
        user_name: j.user?.full_name || j.user?.username || "User",
        user_role: j.user?.role || null,
      };
    }),
  };
}

function csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB");
  } catch {
    return "";
  }
}

function buildEventReportCsv(report) {
  const lines = [];
  const ev = report.event;
  const sum = report.summary;

  lines.push("Event Live Session Report");
  lines.push(`Generated,${csvEscape(fmtDate(report.generated_at))}`);
  lines.push(`Event,${csvEscape(ev.title)}`);
  lines.push(`Type,${csvEscape(ev.event_type)}`);
  lines.push(`Delivery,${csvEscape(ev.delivery_mode)}`);
  lines.push(`Start,${csvEscape(fmtDate(ev.start_date))}`);
  lines.push(`End,${csvEscape(fmtDate(ev.end_date))}`);
  lines.push(`Session status,${csvEscape(ev.session_status)}`);
  lines.push(`Location,${csvEscape(ev.location || "")}`);
  lines.push("");
  lines.push("Summary metric,Value");
  lines.push(`Lobby requests,${sum.total_lobby_requests}`);
  lines.push(`Admitted,${sum.admitted}`);
  lines.push(`Denied,${sum.denied}`);
  lines.push(`Left,${sum.left}`);
  lines.push(`Still waiting,${sum.waiting}`);
  lines.push(`Avg minutes in event,${sum.avg_minutes_in_event}`);
  lines.push(`Chat messages,${sum.total_chat_messages}`);
  lines.push(`Questions,${sum.total_questions}`);
  lines.push(`Questions answered,${sum.questions_answered}`);
  lines.push(`Reactions,${sum.total_reactions}`);
  lines.push("");
  lines.push(
    [
      "Name",
      "Role",
      "Email",
      "Admission",
      "Status",
      "Requested",
      "Admitted",
      "Left",
      "Minutes in event",
      "Admitted by",
    ].join(",")
  );
  for (const a of report.attendees) {
    lines.push(
      [
        csvEscape(a.user?.full_name || a.user?.username),
        csvEscape(a.user?.role),
        csvEscape(a.user?.email),
        csvEscape(a.student?.admission_number),
        csvEscape(a.status),
        csvEscape(fmtDate(a.requested_at)),
        csvEscape(fmtDate(a.admitted_at)),
        csvEscape(fmtDate(a.left_at)),
        csvEscape(a.minutes_in_event ?? ""),
        csvEscape(a.admitted_by?.full_name || a.admitted_by?.username || ""),
      ].join(",")
    );
  }
  lines.push("");
  lines.push("Chat & questions");
  lines.push(["Time", "Author", "Role", "Type", "Answered", "Message"].join(","));
  for (const m of report.chat) {
    lines.push(
      [
        csvEscape(fmtDate(m.sent_at)),
        csvEscape(m.author?.full_name || m.author?.username),
        csvEscape(m.author?.role),
        csvEscape(m.is_question ? "Question" : "Chat"),
        csvEscape(m.is_question ? (m.is_answered ? "Yes" : "No") : ""),
        csvEscape(m.message),
      ].join(",")
    );
    for (const r of m.replies || []) {
      lines.push(
        [
          csvEscape(fmtDate(r.sent_at)),
          csvEscape(r.author?.full_name || r.author?.username),
          csvEscape(r.author?.role),
          csvEscape("Reply"),
          "",
          csvEscape(r.message),
        ].join(",")
      );
    }
  }
  lines.push("");
  lines.push("Reactions");
  lines.push(["Time", "User", "Role", "Emoji"].join(","));
  for (const r of report.reactions) {
    lines.push(
      [
        csvEscape(fmtDate(r.at)),
        csvEscape(r.user_name),
        csvEscape(r.user_role),
        csvEscape(r.emoji),
      ].join(",")
    );
  }

  return `${lines.join("\r\n")}\n`;
}

module.exports = { buildEventReport, buildEventReportCsv, assertOnlineEventReport };
