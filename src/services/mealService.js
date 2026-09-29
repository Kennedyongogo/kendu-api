/**
 * Meal card domain helpers: school-local time, meal windows (defaults + day overrides),
 * unique card codes, download allowance and monthly serving maps.
 */
const crypto = require("crypto");
const { QueryTypes, Op } = require("sequelize");
const {
  sequelize,
  MealPeriod,
  MealPeriodOverride,
  MealCard,
  MealServing,
  MealDownloadPolicy,
} = require("../models");
const { getAccessPolicy, evaluateFeatureAccess } = require("./accessPolicyService");

const SCHOOL_TZ = process.env.SCHOOL_TIMEZONE || "Africa/Nairobi";
const QR_PREFIX = "KASMS-MC:";
const MEAL_CODES = ["B", "L", "S"];

const MEAL_DEFAULTS = [
  { meal_code: "B", name: "Breakfast", start_time: "06:30", end_time: "08:30" },
  { meal_code: "L", name: "Lunch", start_time: "12:30", end_time: "14:00" },
  { meal_code: "S", name: "Supper", start_time: "18:00", end_time: "19:30" },
];

const MEAL_NAMES = { B: "Breakfast", L: "Lunch", S: "Supper" };

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

/** Current school-local date ("YYYY-MM-DD") and time ("HH:MM"). */
function schoolNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function normalizeTime(value) {
  const m = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeDate(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function normalizeMealCode(value) {
  const code = String(value ?? "").trim().toUpperCase().charAt(0);
  return MEAL_CODES.includes(code) ? code : null;
}

function windowsOverlap(a, b) {
  return a.start_time <= b.end_time && b.start_time <= a.end_time;
}

/** Throws when any two active windows overlap (scans must resolve to exactly one meal). */
function assertNoOverlap(windows) {
  const active = windows.filter((w) => w.is_active !== false);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (windowsOverlap(active[i], active[j])) {
        throw httpError(
          400,
          `${MEAL_NAMES[active[i].meal_code]} (${active[i].start_time}–${active[i].end_time}) overlaps ${MEAL_NAMES[active[j].meal_code]} (${active[j].start_time}–${active[j].end_time}).`
        );
      }
    }
  }
}

async function ensureMealPeriods() {
  const existing = await MealPeriod.findAll();
  const have = new Set(existing.map((p) => p.meal_code));
  const missing = MEAL_DEFAULTS.filter((d) => !have.has(d.meal_code));
  if (missing.length) await MealPeriod.bulkCreate(missing.map((d) => ({ ...d, is_active: true })));
  const rows = missing.length ? await MealPeriod.findAll() : existing;
  return rows
    .map((r) => r.get({ plain: true }))
    .sort((a, b) => MEAL_CODES.indexOf(a.meal_code) - MEAL_CODES.indexOf(b.meal_code));
}

/** Effective windows for a date: defaults, replaced by that day's overrides. */
async function getWindowsForDate(serviceDate) {
  const [periods, overrides] = await Promise.all([
    ensureMealPeriods(),
    MealPeriodOverride.findAll({ where: { service_date: serviceDate } }),
  ]);
  const byMeal = new Map(overrides.map((o) => [o.meal_code, o.get({ plain: true })]));
  return periods.map((p) => {
    const o = byMeal.get(p.meal_code);
    return {
      meal_code: p.meal_code,
      name: p.name,
      is_active: p.is_active,
      default_start: p.start_time,
      default_end: p.end_time,
      start_time: o ? o.start_time : p.start_time,
      end_time: o ? o.end_time : p.end_time,
      source: o ? "override" : "default",
      override_id: o?.id || null,
      override_reason: o?.reason || null,
    };
  });
}

function findOpenWindow(windows, time) {
  return windows.find((w) => w.is_active && w.start_time <= time && time <= w.end_time) || null;
}

function findNextWindow(windows, time) {
  return (
    windows
      .filter((w) => w.is_active && w.start_time > time)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))[0] || null
  );
}

// ── Card codes ────────────────────────────────────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 20-char base32 (100 bits); uppercase so the QR stays in compact alphanumeric mode. */
function generateCardCode() {
  const bytes = crypto.randomBytes(13);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 20) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, 20);
}

function qrPayloadForCode(code) {
  return `${QR_PREFIX}${code}`;
}

/** Accepts the raw QR text ("KASMS-MC:XXXX") or just the code. */
function parseScanPayload(raw) {
  const text = String(raw ?? "").trim().toUpperCase();
  if (!text) return null;
  const code = text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
  return /^[A-Z2-7]{20}$/.test(code) ? code : null;
}

async function getActiveCard(studentId) {
  const row = await MealCard.findOne({
    where: { student_id: studentId, status: "active" },
    order: [["version", "DESC"]],
  });
  return row ? row.get({ plain: true }) : null;
}

async function nextCardVersion(studentId, transaction) {
  const max = await MealCard.max("version", { where: { student_id: studentId }, transaction });
  return (Number(max) || 0) + 1;
}

/** Replace the student's active card with a new one carrying `code`. */
async function issueCard(studentId, code, version, transaction) {
  const now = new Date();
  await MealCard.update(
    { status: "replaced", replaced_at: now },
    { where: { student_id: studentId, status: "active" }, transaction }
  );
  const card = await MealCard.create(
    { student_id: studentId, code, version, status: "active", issued_at: now },
    { transaction }
  );
  return card.get({ plain: true });
}

// ── Download limits ───────────────────────────────────────────────────────

async function getDownloadPolicy() {
  let row = await MealDownloadPolicy.findOne({ order: [["created_at", "ASC"]] });
  if (!row) row = await MealDownloadPolicy.create({ is_enabled: false, max_downloads: 2 });
  return row;
}

function policyRangeActive(policy, today) {
  return Boolean(
    policy.is_enabled &&
      policy.start_date &&
      policy.end_date &&
      policy.start_date <= today &&
      today <= policy.end_date
  );
}

/**
 * How many downloads the student has left in the current policy range.
 * Outside the range (or with the policy off) downloads are unlimited.
 */
async function downloadAllowance(studentId) {
  const policy = (await getDownloadPolicy()).get({ plain: true });
  const { date: today } = schoolNow();
  const base = {
    policy_enabled: policy.is_enabled,
    range_start: policy.start_date,
    range_end: policy.end_date,
    max_downloads: policy.max_downloads,
  };
  if (!policyRangeActive(policy, today)) {
    return { ...base, limited: false, used: 0, extra: 0, allowed: null, remaining: null };
  }
  const [row] = await sequelize.query(
    `SELECT
       (SELECT COUNT(*) FROM meal_card_downloads d
          WHERE d.student_id = :sid
            AND (d.downloaded_at AT TIME ZONE :tz)::date BETWEEN :rs AND :re)::int AS used,
       (SELECT COALESCE(SUM(g.extra_downloads), 0) FROM meal_download_grants g
          WHERE g.student_id = :sid AND g.range_start = :rs AND g.range_end = :re)::int AS extra`,
    {
      replacements: { sid: studentId, tz: SCHOOL_TZ, rs: policy.start_date, re: policy.end_date },
      type: QueryTypes.SELECT,
    }
  );
  const used = Number(row?.used) || 0;
  const extra = Number(row?.extra) || 0;
  const allowed = policy.max_downloads + extra;
  return { ...base, limited: true, used, extra, allowed, remaining: Math.max(0, allowed - used) };
}

// ── Servings ──────────────────────────────────────────────────────────────

/** { "7": { B: true, L: false, S: true }, ... } for the student's servings in the month of `date`. */
async function monthServingMap(studentId, date = schoolNow().date) {
  const [y, m] = date.split("-");
  const start = `${y}-${m}-01`;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  const rows = await MealServing.findAll({
    where: { student_id: studentId, service_date: { [Op.between]: [start, end] } },
    attributes: ["service_date", "meal_code"],
    raw: true,
  });
  const map = {};
  rows.forEach((r) => {
    const day = String(Number(String(r.service_date).slice(8, 10)));
    map[day] = map[day] || { B: false, L: false, S: false };
    map[day][r.meal_code] = true;
  });
  return map;
}

async function todayServedFlags(studentId, serviceDate) {
  const rows = await MealServing.findAll({
    where: { student_id: studentId, service_date: serviceDate },
    attributes: ["meal_code", "served_at", "method"],
    raw: true,
  });
  const flags = { B: null, L: null, S: null };
  rows.forEach((r) => {
    flags[r.meal_code] = { served_at: r.served_at, method: r.method };
  });
  return flags;
}

/** Fee gate for meals; skips the ledger entirely when the policy is off. */
async function mealFeeAccess(studentId) {
  const policy = await getAccessPolicy("meals");
  if (!policy.is_enabled) return { eligible: true, is_enabled: false, message: null };
  const { buildLedger } = require("../controllers/accountingController");
  const ledger = await buildLedger(studentId);
  return evaluateFeatureAccess("meals", ledger.summary);
}

module.exports = {
  SCHOOL_TZ,
  MEAL_CODES,
  MEAL_NAMES,
  MEAL_DEFAULTS,
  httpError,
  schoolNow,
  normalizeTime,
  normalizeDate,
  normalizeMealCode,
  assertNoOverlap,
  ensureMealPeriods,
  getWindowsForDate,
  findOpenWindow,
  findNextWindow,
  generateCardCode,
  qrPayloadForCode,
  parseScanPayload,
  getActiveCard,
  nextCardVersion,
  issueCard,
  getDownloadPolicy,
  policyRangeActive,
  downloadAllowance,
  monthServingMap,
  todayServedFlags,
  mealFeeAccess,
};
