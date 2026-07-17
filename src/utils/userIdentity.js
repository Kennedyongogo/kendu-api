const { Op, fn, col, where: sqlWhere } = require("sequelize");

/** Store emails lowercase so login (and public portal) match reliably. */
function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim() : "";
}

/** WHERE clause for "already exists" checks (case-insensitive email + username). */
function duplicateUserWhere(emailRaw, usernameRaw) {
  const emailNorm = normalizeEmail(emailRaw);
  const userNorm = normalizeUsername(usernameRaw).toLowerCase();
  return {
    [Op.or]: [
      sqlWhere(fn("LOWER", col("email")), emailNorm),
      sqlWhere(fn("LOWER", col("username")), userNorm),
    ],
  };
}

module.exports = {
  normalizeEmail,
  normalizeUsername,
  duplicateUserWhere,
};
