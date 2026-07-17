const { AuditTrail } = require("../models");

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "access_token",
  "authorization",
]);

function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

function sanitizePayload(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      const k = String(key).toLowerCase();
      if (SENSITIVE_KEYS.has(k) || k.includes("password") || k.includes("secret")) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizePayload(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * Persist an audit trail entry. Never throws to callers.
 */
async function logAudit(entry = {}) {
  try {
    await AuditTrail.create({
      user_id: entry.user_id || null,
      action: entry.action || "other",
      resource_type: entry.resource_type || "system",
      resource_id: entry.resource_id ? String(entry.resource_id) : null,
      description: entry.description || null,
      status: entry.status || "success",
      old_values: entry.old_values ? sanitizePayload(entry.old_values) : null,
      new_values: entry.new_values ? sanitizePayload(entry.new_values) : null,
      metadata: entry.metadata ? sanitizePayload(entry.metadata) : null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    });
  } catch (error) {
    console.error("[audit] failed to write entry:", error.message);
  }
}

async function logFromRequest(req, partial = {}) {
  return logAudit({
    user_id: req.user?.id || null,
    ip_address: getIpAddress(req),
    user_agent: req.headers["user-agent"] || null,
    ...partial,
  });
}

module.exports = {
  logAudit,
  logFromRequest,
  sanitizePayload,
  getIpAddress,
};
