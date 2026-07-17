/**
 * Automatically records CRUD activity for authenticated API requests.
 * Skips GET list noise on audit-trail itself; still logs mutating verbs.
 */
const { logFromRequest } = require("./auditLogger");

const RESOURCE_BY_PREFIX = {
  users: "user",
  programmes: "programme",
  "audit-trail": "audit_trail",
};

function cleanPath(req) {
  return (req.originalUrl || req.url || "").split("?")[0];
}

function actionFromMethod(method) {
  const m = String(method || "GET").toUpperCase();
  if (m === "POST") return "create";
  if (m === "PUT" || m === "PATCH") return "update";
  if (m === "DELETE") return "delete";
  if (m === "GET" || m === "HEAD") return "read";
  return "other";
}

function inferResource(path) {
  const relative = path.replace(/^\/api\/?/, "");
  const segments = relative.split("/").filter(Boolean);
  const first = segments[0] || "system";
  const resource_type = RESOURCE_BY_PREFIX[first] || first;
  const idCandidate = [...segments]
    .reverse()
    .find((seg) => /^[0-9a-f-]{36}$/i.test(seg) || /^\d+$/.test(seg));
  return { resource_type, resource_id: idCandidate || null };
}

function shouldAudit(req) {
  const path = cleanPath(req);
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith("/api/auth/")) return false;
  // Login is logged explicitly in userController with action "login"
  if (path === "/api/users/login" || path.startsWith("/api/users/login/")) return false;
  // Avoid logging every audit-trail list GET (noise)
  if (path.startsWith("/api/audit-trail") && req.method === "GET") return false;
  // Dashboard stats polling — skip noise
  if (path.startsWith("/api/dashboard") && req.method === "GET") return false;
  // Programme mutations are logged in programmeController with old/new values
  if (
    path.startsWith("/api/programmes") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(String(req.method || "").toUpperCase())
  ) {
    return false;
  }
  // Public programme list reads are fine to skip unless authenticated
  if (path.startsWith("/api/programmes") && req.method === "GET" && !req.user) return false;
  const method = String(req.method || "").toUpperCase();
  // Track all mutating CRUD; optional reads when user is logged in
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (method === "GET" && req.user) return true;
  return false;
}

function auditCrudActivity(req, res, next) {
  res.on("finish", () => {
    if (!shouldAudit(req)) return;

    const path = cleanPath(req);
    const action = actionFromMethod(req.method);
    const { resource_type, resource_id } = inferResource(path);
    const status = res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failed";

    void logFromRequest(req, {
      action,
      resource_type,
      resource_id,
      description: `${req.method} ${path}`,
      status,
      new_values:
        req.body && typeof req.body === "object" && Object.keys(req.body).length
          ? req.body
          : null,
      metadata: {
        method: req.method,
        path,
        status_code: res.statusCode,
      },
    }).catch(() => {});
  });
  next();
}

module.exports = auditCrudActivity;
