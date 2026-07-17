/** Audit trail model removed — no-op middleware. */
function auditAdminActivity(req, res, next) {
  next();
}

module.exports = auditAdminActivity;
