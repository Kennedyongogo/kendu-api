/**
 * Fee-based access helpers shared by units registration and Access UI.
 */
const { AccessPolicy } = require("../models");

const FEATURE_DEFAULTS = {
  units: {
    min_fee_percent: 0,
    is_enabled: true,
    description: "Students must pay this share of their total fees before enrolling in semester units.",
  },
  meals: {
    min_fee_percent: 0,
    is_enabled: false,
    description: "Fee share required before downloading a meal card.",
  },
  exams: {
    min_fee_percent: 0,
    is_enabled: false,
    description: "Fee share required before sitting exams / downloading an exam card.",
  },
};

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clampPercent(value, fallback = 0) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

async function ensureAccessPolicy(feature) {
  const defaults = FEATURE_DEFAULTS[feature];
  if (!defaults) {
    const err = new Error(`Unknown access feature: ${feature}`);
    err.status = 400;
    throw err;
  }

  const [row] = await AccessPolicy.findOrCreate({
    where: { feature },
    defaults: {
      feature,
      min_fee_percent: defaults.min_fee_percent,
      is_enabled: defaults.is_enabled,
      description: defaults.description,
    },
  });
  return row;
}

async function getAccessPolicy(feature) {
  const row = await ensureAccessPolicy(feature);
  return row.get({ plain: true });
}

async function listAccessPolicies() {
  const features = Object.keys(FEATURE_DEFAULTS);
  const rows = [];
  for (const feature of features) {
    rows.push(await getAccessPolicy(feature));
  }
  return rows;
}

async function updateAccessPolicy(feature, { min_fee_percent, is_enabled, description, updated_by }) {
  const row = await ensureAccessPolicy(feature);
  const patch = {};
  if (min_fee_percent !== undefined) patch.min_fee_percent = clampPercent(min_fee_percent, row.min_fee_percent);
  if (is_enabled !== undefined) patch.is_enabled = Boolean(is_enabled);
  if (description !== undefined) {
    patch.description = description == null || String(description).trim() === ""
      ? null
      : String(description).trim();
  }
  if (updated_by) patch.updated_by = updated_by;
  await row.update(patch);
  return row.get({ plain: true });
}

/**
 * @param {{ total_charged: number, total_paid: number, currency?: string }} summary
 */
function feeProgressFromSummary(summary = {}) {
  const totalCharged = money(summary.total_charged);
  const totalPaid = money(summary.total_paid);
  const percentPaid =
    totalCharged > 0
      ? Math.min(100, Math.round((totalPaid / totalCharged) * 10000) / 100)
      : 0;
  return {
    currency: summary.currency || "KES",
    total_charged: totalCharged,
    total_paid: totalPaid,
    percent_paid: percentPaid,
  };
}

/**
 * Evaluate whether a student may access a feature based on fee progress.
 */
async function evaluateFeatureAccess(feature, feeSummary) {
  const policy = await getAccessPolicy(feature);
  const progress = feeProgressFromSummary(feeSummary);
  const required = policy.is_enabled ? clampPercent(policy.min_fee_percent) : 0;
  const eligible = !policy.is_enabled || progress.percent_paid + 1e-9 >= required;

  const actionLabel =
    feature === "meals"
      ? "download your meal card"
      : feature === "exams"
        ? "download your exam card"
        : "enroll in units";

  return {
    feature,
    eligible,
    is_enabled: policy.is_enabled,
    min_fee_percent: required,
    percent_paid: progress.percent_paid,
    total_charged: progress.total_charged,
    total_paid: progress.total_paid,
    currency: progress.currency,
    shortfall_percent: eligible ? 0 : Math.max(0, Math.round((required - progress.percent_paid) * 100) / 100),
    message: eligible
      ? null
      : `You need to have paid at least ${required}% of your fees to ${actionLabel}. You have paid ${progress.percent_paid}%.`,
  };
}

module.exports = {
  FEATURE_DEFAULTS,
  ensureAccessPolicy,
  getAccessPolicy,
  listAccessPolicies,
  updateAccessPolicy,
  feeProgressFromSummary,
  evaluateFeatureAccess,
  clampPercent,
};
