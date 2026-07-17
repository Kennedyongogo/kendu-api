/** Canonical user roles (must match Sequelize ENUM on `users.role`). */
exports.SUPER_ADMIN_ROLE = "super_admin";

/** School staff who share most admin-module routes. */
exports.STAFF_ROLES = ["super_admin", "admin", "accountant", "librarian"];

/**
 * Staff plus teachers — matches routes used by the admin web app after login.
 * Parents/students are blocked at login (`portal: "admin"`); keep STAFF_ROLES for data rules that exclude teachers.
 */
exports.ADMIN_PORTAL_API_ROLES = [...exports.STAFF_ROLES, "teacher"];

/** Blocked from signing in when `portal` is `"admin"` on POST /api/users/login. */
exports.ADMIN_PORTAL_LOGIN_BLOCKED_ROLES = ["parent", "student"];

/** Allowed when `portal` is `"public"` on POST /api/users/login (school website parent/student portal). */
exports.PUBLIC_PORTAL_ALLOWED_ROLES = ["parent", "student"];

/** School-level administrators (not accountant/librarian). */
exports.SCHOOL_ADMIN_ROLES = ["super_admin", "admin"];

/** Every assignable `User.role` value. */
exports.ALL_USER_ROLES = [
  "super_admin",
  "admin",
  "teacher",
  "student",
  "parent",
  "accountant",
  "librarian",
];

exports.isStaffRole = (role) => exports.STAFF_ROLES.includes(role);
exports.isSchoolAdminRole = (role) => exports.SCHOOL_ADMIN_ROLES.includes(role);
