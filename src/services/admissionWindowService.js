const { AdmissionSetting } = require("../models");

const DEFAULT_CLOSED_MESSAGE =
  "Admissions are currently closed. Please check back during the next intake window.";

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatFriendlyDateTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return d.toISOString();
  }
}

/** Public closed notice — always system-generated from window state (never free-typed). */
function buildClosedMessage({ reason, starts_at, ends_at }) {
  const opens = formatFriendlyDateTime(starts_at);
  const closes = formatFriendlyDateTime(ends_at);
  switch (reason) {
    case "not_started":
      return opens
        ? `Admissions are not open yet. Applications open on ${opens}.`
        : "Admissions are not open yet. Please check back when the intake window starts.";
    case "ended":
      return closes
        ? `The admissions window closed on ${closes}. Please wait for the next intake.`
        : "The admissions window has ended. Please wait for the next intake.";
    case "not_configured":
    case "invalid_range":
      return "Admissions are not open yet. Please check back later.";
    case "open":
      return closes
        ? `Applications are open until ${closes}.`
        : "Applications are currently open.";
    case "disabled":
    default:
      return DEFAULT_CLOSED_MESSAGE;
  }
}

function evaluateWindow(row, now = new Date()) {
  const is_enabled = Boolean(row?.is_enabled);
  const starts_at = row?.starts_at ? new Date(row.starts_at) : null;
  const ends_at = row?.ends_at ? new Date(row.ends_at) : null;

  let reason = "disabled";
  let is_open = false;

  if (!is_enabled) {
    reason = "disabled";
  } else if (!starts_at || !ends_at || Number.isNaN(starts_at.getTime()) || Number.isNaN(ends_at.getTime())) {
    reason = "not_configured";
  } else if (starts_at.getTime() > ends_at.getTime()) {
    reason = "invalid_range";
  } else if (now.getTime() < starts_at.getTime()) {
    reason = "not_started";
  } else if (now.getTime() > ends_at.getTime()) {
    reason = "ended";
  } else {
    reason = "open";
    is_open = true;
  }

  const startsIso = starts_at && !Number.isNaN(starts_at.getTime()) ? starts_at.toISOString() : null;
  const endsIso = ends_at && !Number.isNaN(ends_at.getTime()) ? ends_at.toISOString() : null;

  return {
    is_enabled,
    starts_at: startsIso,
    ends_at: endsIso,
    closed_message: buildClosedMessage({
      reason,
      starts_at: startsIso,
      ends_at: endsIso,
    }),
    is_open,
    reason,
    server_time: now.toISOString(),
  };
}

async function getOrCreateSettings() {
  let row = await AdmissionSetting.findOne({ where: { key: "default" } });
  if (!row) {
    row = await AdmissionSetting.create({
      key: "default",
      is_enabled: false,
      starts_at: null,
      ends_at: null,
      closed_message: DEFAULT_CLOSED_MESSAGE,
    });
  }
  return row;
}

async function getAdmissionWindowStatus(now = new Date()) {
  const row = await getOrCreateSettings();
  return {
    ...evaluateWindow(row, now),
    id: row.id,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

async function assertAdmissionsOpen() {
  const status = await getAdmissionWindowStatus();
  if (status.is_open) return status;
  const err = new Error(status.closed_message || DEFAULT_CLOSED_MESSAGE);
  err.status = 403;
  err.code = "ADMISSIONS_CLOSED";
  err.data = status;
  throw err;
}

async function updateAdmissionWindow(body, updatedBy = null) {
  const row = await getOrCreateSettings();
  const patch = {};

  if (body.is_enabled !== undefined) {
    patch.is_enabled = toBool(body.is_enabled, false);
  }

  if (Object.prototype.hasOwnProperty.call(body, "starts_at")) {
    if (body.starts_at === null || body.starts_at === "") {
      patch.starts_at = null;
    } else {
      const d = parseDate(body.starts_at);
      if (!d) {
        const err = new Error("starts_at must be a valid date/time");
        err.status = 400;
        throw err;
      }
      patch.starts_at = d;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "ends_at")) {
    if (body.ends_at === null || body.ends_at === "") {
      patch.ends_at = null;
    } else {
      const d = parseDate(body.ends_at);
      if (!d) {
        const err = new Error("ends_at must be a valid date/time");
        err.status = 400;
        throw err;
      }
      patch.ends_at = d;
    }
  }

  // closed_message is system-generated at read time; ignore any client-supplied text.

  const nextStarts = patch.starts_at !== undefined ? patch.starts_at : row.starts_at;
  const nextEnds = patch.ends_at !== undefined ? patch.ends_at : row.ends_at;
  if (nextStarts && nextEnds && new Date(nextStarts).getTime() > new Date(nextEnds).getTime()) {
    const err = new Error("Start date must be before end date");
    err.status = 400;
    throw err;
  }

  if (updatedBy) patch.updated_by = updatedBy;

  await row.update(patch);
  return getAdmissionWindowStatus();
}

module.exports = {
  DEFAULT_CLOSED_MESSAGE,
  buildClosedMessage,
  evaluateWindow,
  getOrCreateSettings,
  getAdmissionWindowStatus,
  assertAdmissionsOpen,
  updateAdmissionWindow,
};
