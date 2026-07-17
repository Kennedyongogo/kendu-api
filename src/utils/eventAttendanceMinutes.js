/** Minutes in event from lobby row (stored duration or admitted → left/now). */
function minutesFromLobbyRow(j) {
  if (j.duration_minutes != null && Number.isFinite(Number(j.duration_minutes))) {
    return Math.max(0, Math.round(Number(j.duration_minutes)));
  }
  if (!j.admitted_at) return null;
  const start = new Date(j.admitted_at);
  if (Number.isNaN(start.getTime())) return null;
  let end = null;
  if (j.left_at) {
    end = new Date(j.left_at);
  } else if (j.status === "admitted") {
    end = new Date();
  }
  if (!end || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function computeDurationOnLeave(entry, leaveAt = new Date()) {
  if (!entry?.admitted_at) return null;
  const start = new Date(entry.admitted_at);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, Math.round((leaveAt.getTime() - start.getTime()) / 60000));
}

/** One row per user — sum minutes across re-joins; keep earliest admission / latest leave. */
function dedupeLobbyEntriesByUser(formattedEntries) {
  const byUser = new Map();
  for (const e of formattedEntries) {
    const uid = e.user?.id;
    if (!uid) continue;
    const mins = e.minutes_in_event ?? 0;
    const existing = byUser.get(uid);
    if (!existing) {
      byUser.set(uid, { ...e, minutes_in_event: mins, visit_count: 1 });
      continue;
    }
    existing.minutes_in_event = (existing.minutes_in_event ?? 0) + mins;
    existing.visit_count = (existing.visit_count || 1) + 1;
    if (e.admitted_at && (!existing.admitted_at || new Date(e.admitted_at) < new Date(existing.admitted_at))) {
      existing.admitted_at = e.admitted_at;
    }
    if (e.left_at && (!existing.left_at || new Date(e.left_at) > new Date(existing.left_at))) {
      existing.left_at = e.left_at;
      existing.status = e.status;
    }
    if (mins > 0 && e.status === "admitted") {
      existing.status = "admitted";
    }
  }
  return [...byUser.values()].sort((a, b) => (b.minutes_in_event ?? 0) - (a.minutes_in_event ?? 0));
}

/** Every lobby row as a visit line, with visit # per user (1, 2, 3…). */
function buildAttendanceLog(formattedEntries) {
  const visitIndexByUser = new Map();
  const log = [];

  for (const e of formattedEntries) {
    const uid = e.user?.id;
    if (!uid) continue;
    const visitNumber = (visitIndexByUser.get(uid) || 0) + 1;
    visitIndexByUser.set(uid, visitNumber);
    log.push({
      ...e,
      visit_number: visitNumber,
    });
  }

  const totalVisitsByUser = new Map();
  for (const row of log) {
    const uid = row.user?.id;
    if (uid) totalVisitsByUser.set(uid, (totalVisitsByUser.get(uid) || 0) + 1);
  }
  for (const row of log) {
    row.user_total_visits = totalVisitsByUser.get(row.user?.id) || 1;
  }

  return log;
}

module.exports = {
  minutesFromLobbyRow,
  computeDurationOnLeave,
  dedupeLobbyEntriesByUser,
  buildAttendanceLog,
};
