const { User } = require("../models");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const { logFromRequest, logLogin, sanitizePayload } = require("../utils/auditLogger");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOURCE_TYPE_BY_SEGMENT = {
  users: "user",
  students: "student",
  teachers: "teacher",
  parents: "parent",
  "school-admins": "school_admin",
  departments: "department",
  exams: "exam",
  "exam-templates": "exam_template",
  "exam-questions": "exam_question",
  "exam-attempts": "exam_attempt",
  "exam-session-logs": "exam_session_log",
  "report-cards": "report_card",
  "student-exam-results": "student_exam_result",
  "grading/subject-scales": "subject_grading_scale",
  "grading/overall-scales": "overall_grading_scale",
  reports: "report",
  "fee-structures": "fee_structure",
  "fee-invoices": "fee_invoice",
  "fee-payments": "fee_payment",
  mpesa: "mpesa",
  curricula: "curriculum",
  news: "news",
  "school-services": "school_service",
  "portal-reviews": "portal_review",
  events: "school_event",
  "admin-meetings": "admin_meeting",
  "admin/notifications": "admin_notification",
  "admission-applications": "admission_application",
  "school-profile": "school_profile",
  "elimu-plus": "elimu_plus",
  "google-meet": "google_meet",
  "proctoring-sessions": "proctoring_session",
  "proctoring-events": "proctoring_event",
  "proctoring-recordings": "proctoring_recording",
  "audit-trail": "audit_trail",
};

const EXCLUDED_PREFIXES = [
  "/api/school-portal",
  "/api/public",
  "/api/mpesa",
  "/api/realtime",
];

function cleanPath(req) {
  return (req.originalUrl || req.url || "").split("?")[0];
}

function shouldAuditRequest(req) {
  const path = cleanPath(req);
  if (!path.startsWith("/api/")) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (path.startsWith("/api/audit-trail") && req.method === "GET") return false;

  if (req.user?.role && ADMIN_PORTAL_API_ROLES.includes(req.user.role)) {
    return true;
  }

  if (path === "/api/users/login" && req.method === "POST") {
    const portal = String(req.body?.portal ?? "admin").trim().toLowerCase();
    return portal === "admin" || portal === "";
  }

  return false;
}

function actionFromMethod(method, path) {
  const m = String(method || "GET").toUpperCase();
  if (path === "/api/users/login" && m === "POST") return "login";
  if (path === "/api/users/logout" && m === "POST") return "logout";
  if (m === "GET" || m === "HEAD") return "read";
  if (m === "POST") return "create";
  if (m === "PUT" || m === "PATCH") return "update";
  if (m === "DELETE") return "delete";
  return "other";
}

function inferResource(path) {
  const relative = path.replace(/^\/api\/?/, "");
  const segments = relative.split("/").filter(Boolean);
  if (!segments.length) {
    return { resource_type: "system", resource_id: null };
  }

  const first = segments[0];
  const second = segments[1];
  const joined = second ? `${first}/${second}` : first;
  const resource_type = RESOURCE_TYPE_BY_SEGMENT[joined] || RESOURCE_TYPE_BY_SEGMENT[first] || "other";

  const idCandidate = [...segments].reverse().find((seg) => UUID_RE.test(seg) || /^\d+$/.test(seg));
  return { resource_type, resource_id: idCandidate || null };
}

function statusFromResponse(res) {
  const code = Number(res.statusCode) || 200;
  if (code >= 200 && code < 400) return "success";
  return "failed";
}

function buildDescription(req, action, resourceType) {
  const method = String(req.method || "GET").toUpperCase();
  const path = cleanPath(req);
  return `${method} ${path} (${action} ${resourceType})`;
}

async function resolveLoginUser(req) {
  const ident = String(req.body?.email || req.body?.username || "").trim();
  if (!ident) return null;
  const { normalizeEmail } = require("../utils/userIdentity");
  const { sequelize } = require("../config/database");
  const { QueryTypes } = require("sequelize");

  let user = await User.findOne({ where: { email: normalizeEmail(ident) } });
  if (!user) {
    const rows = await sequelize.query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = :ident OR LOWER(TRIM(username)) = :ident LIMIT 1`,
      { replacements: { ident: ident.toLowerCase() }, type: QueryTypes.SELECT }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    user = row?.id ? await User.findByPk(row.id) : null;
  }
  return user;
}

async function persistAudit(req, res) {
  if (!shouldAuditRequest(req)) return;

  const path = cleanPath(req);
  const action = actionFromMethod(req.method, path);
  const { resource_type, resource_id } = inferResource(path);
  const status = statusFromResponse(res);

  if (path === "/api/users/login" && req.method === "POST") {
    const user = status === "success" ? await resolveLoginUser(req) : null;
    if (user && !ADMIN_PORTAL_API_ROLES.includes(user.role)) return;
    await logLogin(req, user, status);
    return;
  }

  if (!req.user?.id) return;

  const metadata = {
    method: req.method,
    path,
    status_code: res.statusCode,
    query: sanitizePayload(req.query || {}),
  };

  const body =
    req.body && typeof req.body === "object" && Object.keys(req.body).length
      ? sanitizePayload(req.body)
      : null;

  const entry = {
    user_id: req.user.id,
    action,
    resource_type,
    resource_id,
    description: buildDescription(req, action, resource_type),
    status,
    metadata,
  };

  if (body && ["create", "update", "delete", "other"].includes(action)) {
    entry.new_values = body;
  }

  await logFromRequest(req, res, entry);
}

/**
 * Records admin-portal API activity after the response is sent (non-blocking).
 */
function auditAdminActivity(req, res, next) {
  res.on("finish", () => {
    void persistAudit(req, res).catch((error) => {
      console.error("[audit] middleware error:", error.message);
    });
  });
  next();
}

module.exports = auditAdminActivity;
