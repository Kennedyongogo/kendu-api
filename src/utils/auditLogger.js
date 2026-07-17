const { AuditTrail } = require("../models");

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "access_token",
  "authorization",
  "mpesa_passkey",
  "mpesa_consumer_secret",
  "jwt_secret",
]);

const MAX_JSON_BYTES = 12_000;

const getIpAddress = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  req.ip ||
  "unknown";

const getUserAgent = (req) => req.headers["user-agent"] || "unknown";

const getRequestMetadata = (req) => ({
  ip_address: getIpAddress(req),
  user_agent: getUserAgent(req),
  user_id: req.user?.id || null,
});

function redactValue(key, value) {
  const k = String(key || "").toLowerCase();
  if (SENSITIVE_KEYS.has(k) || k.includes("password") || k.includes("secret") || k.includes("token")) {
    return "[REDACTED]";
  }
  return value;
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return value;
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizePayload(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = sanitizePayload(redactValue(key, val), depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) {
    return `${value.slice(0, 2000)}…`;
  }
  return value;
}

function trimJson(value) {
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_JSON_BYTES) return value;
    return { _truncated: true, preview: json.slice(0, MAX_JSON_BYTES) };
  } catch {
    return { _unserializable: true };
  }
}

async function logAudit(entry = {}) {
  try {
    const payload = {
      user_id: entry.user_id ?? null,
      action: String(entry.action || "other").slice(0, 40),
      resource_type: String(entry.resource_type || "other").slice(0, 60),
      resource_id: entry.resource_id != null ? String(entry.resource_id).slice(0, 120) : null,
      description: entry.description ? String(entry.description).slice(0, 4000) : null,
      status: ["success", "failed", "pending"].includes(entry.status) ? entry.status : "success",
      ip_address: entry.ip_address ? String(entry.ip_address).slice(0, 64) : null,
      user_agent: entry.user_agent ? String(entry.user_agent).slice(0, 2000) : null,
      old_values: entry.old_values != null ? trimJson(sanitizePayload(entry.old_values)) : null,
      new_values: entry.new_values != null ? trimJson(sanitizePayload(entry.new_values)) : null,
      metadata: entry.metadata != null ? trimJson(sanitizePayload(entry.metadata)) : null,
    };
    return await AuditTrail.create(payload);
  } catch (error) {
    console.error("[audit] failed to persist audit trail:", error.message);
    return null;
  }
}

async function logFromRequest(req, res, overrides = {}) {
  const meta = getRequestMetadata(req);
  return logAudit({
    user_id: overrides.user_id ?? req.user?.id ?? null,
    action: overrides.action,
    resource_type: overrides.resource_type,
    resource_id: overrides.resource_id,
    description: overrides.description,
    status: overrides.status,
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
    old_values: overrides.old_values,
    new_values: overrides.new_values,
    metadata: overrides.metadata,
  });
}

const logLogin = (req, user, status = "success") =>
  logFromRequest(req, null, {
    user_id: user?.id ?? null,
    action: "login",
    resource_type: "system",
    resource_id: user?.id ?? null,
    description: `Admin portal login${user?.email ? ` (${user.email})` : ""}`,
    status,
    metadata: {
      portal: req.body?.portal ?? "admin",
      role: user?.role ?? null,
    },
  });

const logLogout = (req) =>
  logFromRequest(req, null, {
    action: "logout",
    resource_type: "system",
    resource_id: req.user?.id ?? null,
    description: "Admin portal logout",
    status: "success",
  });

const logCreate = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "create",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    new_values: extra.new_values,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

const logUpdate = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "update",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    old_values: extra.old_values,
    new_values: extra.new_values,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

const logDelete = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "delete",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    old_values: extra.old_values,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

const logStatusChange = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "status_change",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    new_values: extra.new_values,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

const logUpload = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "upload",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

const logDownload = (req, resourceType, resourceId, description, extra = {}) =>
  logFromRequest(req, null, {
    action: "download",
    resource_type: resourceType,
    resource_id: resourceId,
    description,
    metadata: extra.metadata,
    status: extra.status || "success",
  });

module.exports = {
  logAudit,
  logFromRequest,
  getIpAddress,
  getUserAgent,
  getRequestMetadata,
  sanitizePayload,
  logLogin,
  logLogout,
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
  logUpload,
  logDownload,
};
