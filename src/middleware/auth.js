const jwt = require("jsonwebtoken");
const { User, UserDepartment } = require("../models");
const config = require("../config/config");

const ADMIN_ROLE = "admin";
const CATERING_ROLE = "catering";

/** Principal and deputy principal share the same access. They are separate roles. */
const LEADERSHIP_ROLES = ["principal", "deputy_principal"];

/** Offices from the requirements capture. */
const OFFICE_ROLES = [
  ...LEADERSHIP_ROLES,
  "hod",
  "academic_registrar",
  "examinations",
  "library",
  "lecturer",
  "secretary",
  "dean",
  "finance",
];

const ALL_USER_ROLES = ["admin", "student", "catering", ...OFFICE_ROLES];

/** Writes that stay with the system admin until an office is named below. */
const ADMIN_WRITE_ROLES = ["admin"];

/** Anyone who signs into the admin portal. */
const PORTAL_ROLES = ["admin", CATERING_ROLE, ...OFFICE_ROLES];

const ADMIN_PORTAL_API_ROLES = ADMIN_WRITE_ROLES;
/** Students use the student portal; catering may use admin or the meal scanner app. */
const ADMIN_PORTAL_LOGIN_BLOCKED_ROLES = ["student"];
const PUBLIC_PORTAL_ALLOWED_ROLES = ["student"];
const SCHOOL_ADMIN_ROLES = ["admin"];
const CATERING_APP_ROLES = ["catering", "admin"];
const MOBILE_APP_ROLES = ["admin", "catering", "lecturer", "hod", "dean"];
/** Used by requireAdmin. Office logins are not included. */
const STAFF_ROLES = ADMIN_WRITE_ROLES;

/** Heads of department and lecturers only see students in their academic department(s). */
const DEPARTMENT_SCOPED_ROLES = ["hod", "lecturer"];

/** Resolve department membership: join table first, then legacy department_id. */
function getActorDepartmentIds(user) {
  if (!user) return [];
  if (Array.isArray(user.department_ids) && user.department_ids.length) {
    return [...new Set(user.department_ids.map((id) => String(id)).filter(Boolean))];
  }
  return user.department_id ? [String(user.department_id)] : [];
}

async function loadUserDepartmentIds(userId, fallbackDepartmentId = null) {
  const links = await UserDepartment.findAll({
    where: { user_id: userId },
    attributes: ["department_id"],
  });
  const ids = links.map((link) => link.department_id).filter(Boolean);
  if (ids.length) return [...new Set(ids.map(String))];
  return fallbackDepartmentId ? [String(fallbackDepartmentId)] : [];
}

const READ_STUDENT_ROLES = PORTAL_ROLES;
const WRITE_STUDENT_ROLES = [...ADMIN_WRITE_ROLES, "secretary", "academic_registrar"];
const WRITE_BOARDING_ROLES = [...WRITE_STUDENT_ROLES, "dean"];

const READ_ADMISSION_ROLES = [
  ...ADMIN_WRITE_ROLES,
  ...LEADERSHIP_ROLES,
  "academic_registrar",
];
const WRITE_ADMISSION_ROLES = [...ADMIN_WRITE_ROLES, "academic_registrar"];

const READ_FEE_ROLES = [
  ...ADMIN_WRITE_ROLES,
  ...LEADERSHIP_ROLES,
  "hod",
  "academic_registrar",
  "examinations",
  "finance",
];
const WRITE_FEE_ROLES = [...ADMIN_WRITE_ROLES, "finance"];
const ACCESS_MANAGE_ROLES = [...ADMIN_WRITE_ROLES, "finance"];

/** Manage class + exam timetables: create / edit / delete. */
const WRITE_TIMETABLE_ROLES = [
  ...ADMIN_WRITE_ROLES,
  "dean",
  "lecturer",
  "examinations",
  "academic_registrar",
  "hod",
];
const WRITE_EXAM_ROLES = WRITE_TIMETABLE_ROLES;
/** Everyone in the portal except catering may view timetables. */
const READ_TIMETABLE_ROLES = PORTAL_ROLES.filter((role) => role !== CATERING_ROLE);
const READ_EXAM_ROLES = READ_TIMETABLE_ROLES;
const APPROVE_EXAM_ROLES = ["admin", "examinations"];

const READ_LIBRARY_ROLES = [...ADMIN_WRITE_ROLES, ...LEADERSHIP_ROLES, "hod", "lecturer", "library"];
const WRITE_LIBRARY_ROLES = [...ADMIN_WRITE_ROLES, "library"];

const READ_REGISTRATION_ROLES = [
  ...ADMIN_WRITE_ROLES,
  ...LEADERSHIP_ROLES,
  "hod",
  "academic_registrar",
  "secretary",
  "lecturer",
];
const WRITE_REGISTRATION_ROLES = [
  ...ADMIN_WRITE_ROLES,
  "hod",
  "secretary",
  "academic_registrar",
];

const READ_PROGRAMME_ROLES = PORTAL_ROLES;
/** Programme & department structure: admin + academic registrar write; others read. */
const WRITE_PROGRAMME_ROLES = [...ADMIN_WRITE_ROLES, "academic_registrar"];
const WRITE_DEPARTMENT_ROLES = [...ADMIN_WRITE_ROLES, "academic_registrar"];

/** Units catalogue: leadership/secretary view; academic offices create & edit. */
const READ_UNIT_ROLES = [
  ...ADMIN_WRITE_ROLES,
  ...LEADERSHIP_ROLES,
  "secretary",
  "hod",
  "lecturer",
  "academic_registrar",
  "examinations",
  "dean",
];
const WRITE_UNIT_ROLES = [
  ...ADMIN_WRITE_ROLES,
  "hod",
  "lecturer",
  "academic_registrar",
  "examinations",
  "dean",
];
const CHURCH_READ_ROLES = [...ADMIN_WRITE_ROLES, "dean", ...LEADERSHIP_ROLES, "hod"];
const CHURCH_WRITE_ROLES = [...ADMIN_WRITE_ROLES, "dean"];
const MEAL_ADMIN_ROLES = ["admin", "dean", "catering"];
const ANNOUNCEMENT_READ_ROLES = PORTAL_ROLES;
const ANNOUNCEMENT_WRITE_ROLES = [...ADMIN_WRITE_ROLES, "secretary"];
const BROCHURE_READ_ROLES = PORTAL_ROLES;
const BROCHURE_WRITE_ROLES = [...ADMIN_WRITE_ROLES, "secretary"];
const STAFF_CHAT_ROLES = PORTAL_ROLES;
const ATTENDANCE_ROLES = [...ADMIN_WRITE_ROLES, "lecturer", "hod"];
const DASHBOARD_ROLES = PORTAL_ROLES;
const DEPARTMENT_READ_ROLES = PORTAL_ROLES;

/** Lecturer edits assignments; leadership and exams read weekly summaries. */
const READ_ASSIGNMENT_ROLES = [
  ...ADMIN_WRITE_ROLES,
  ...LEADERSHIP_ROLES,
  "hod",
  "examinations",
  "lecturer",
];
const WRITE_ASSIGNMENT_ROLES = [...ADMIN_WRITE_ROLES, "lecturer"];

exports.ADMIN_ROLE = ADMIN_ROLE;
exports.CATERING_ROLE = CATERING_ROLE;
exports.OFFICE_ROLES = OFFICE_ROLES;
exports.CATERING_APP_ROLES = CATERING_APP_ROLES;
exports.MOBILE_APP_ROLES = MOBILE_APP_ROLES;
exports.STAFF_ROLES = STAFF_ROLES;
exports.ADMIN_PORTAL_API_ROLES = ADMIN_PORTAL_API_ROLES;
exports.ADMIN_PORTAL_LOGIN_BLOCKED_ROLES = ADMIN_PORTAL_LOGIN_BLOCKED_ROLES;
exports.PUBLIC_PORTAL_ALLOWED_ROLES = PUBLIC_PORTAL_ALLOWED_ROLES;
exports.SCHOOL_ADMIN_ROLES = SCHOOL_ADMIN_ROLES;
exports.ALL_USER_ROLES = ALL_USER_ROLES;
exports.PORTAL_ROLES = PORTAL_ROLES;
exports.DEPARTMENT_SCOPED_ROLES = DEPARTMENT_SCOPED_ROLES;
exports.getActorDepartmentIds = getActorDepartmentIds;
exports.loadUserDepartmentIds = loadUserDepartmentIds;
exports.READ_STUDENT_ROLES = READ_STUDENT_ROLES;
exports.WRITE_STUDENT_ROLES = WRITE_STUDENT_ROLES;
exports.WRITE_BOARDING_ROLES = WRITE_BOARDING_ROLES;
exports.READ_ADMISSION_ROLES = READ_ADMISSION_ROLES;
exports.WRITE_ADMISSION_ROLES = WRITE_ADMISSION_ROLES;
exports.READ_FEE_ROLES = READ_FEE_ROLES;
exports.WRITE_FEE_ROLES = WRITE_FEE_ROLES;
exports.ACCESS_MANAGE_ROLES = ACCESS_MANAGE_ROLES;
exports.READ_TIMETABLE_ROLES = READ_TIMETABLE_ROLES;
exports.WRITE_TIMETABLE_ROLES = WRITE_TIMETABLE_ROLES;
exports.READ_EXAM_ROLES = READ_EXAM_ROLES;
exports.WRITE_EXAM_ROLES = WRITE_EXAM_ROLES;
exports.APPROVE_EXAM_ROLES = APPROVE_EXAM_ROLES;
exports.READ_LIBRARY_ROLES = READ_LIBRARY_ROLES;
exports.WRITE_LIBRARY_ROLES = WRITE_LIBRARY_ROLES;
exports.READ_REGISTRATION_ROLES = READ_REGISTRATION_ROLES;
exports.WRITE_REGISTRATION_ROLES = WRITE_REGISTRATION_ROLES;
exports.READ_PROGRAMME_ROLES = READ_PROGRAMME_ROLES;
exports.WRITE_PROGRAMME_ROLES = WRITE_PROGRAMME_ROLES;
exports.WRITE_DEPARTMENT_ROLES = WRITE_DEPARTMENT_ROLES;
exports.READ_UNIT_ROLES = READ_UNIT_ROLES;
exports.WRITE_UNIT_ROLES = WRITE_UNIT_ROLES;
exports.CHURCH_READ_ROLES = CHURCH_READ_ROLES;
exports.CHURCH_WRITE_ROLES = CHURCH_WRITE_ROLES;
exports.MEAL_ADMIN_ROLES = MEAL_ADMIN_ROLES;
exports.ANNOUNCEMENT_READ_ROLES = ANNOUNCEMENT_READ_ROLES;
exports.ANNOUNCEMENT_WRITE_ROLES = ANNOUNCEMENT_WRITE_ROLES;
exports.BROCHURE_READ_ROLES = BROCHURE_READ_ROLES;
exports.BROCHURE_WRITE_ROLES = BROCHURE_WRITE_ROLES;
exports.STAFF_CHAT_ROLES = STAFF_CHAT_ROLES;
exports.ATTENDANCE_ROLES = ATTENDANCE_ROLES;
exports.DASHBOARD_ROLES = DASHBOARD_ROLES;
exports.DEPARTMENT_READ_ROLES = DEPARTMENT_READ_ROLES;
exports.READ_ASSIGNMENT_ROLES = READ_ASSIGNMENT_ROLES;
exports.WRITE_ASSIGNMENT_ROLES = WRITE_ASSIGNMENT_ROLES;

exports.authenticateUser = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied, no token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type !== "user") {
      return res.status(403).json({
        success: false,
        message: "Access denied, invalid token type",
      });
    }

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password_hash"] },
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Access denied, invalid or inactive user",
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Access denied, invalid or inactive user",
      });
    }

    if (user.role === "student" && String(user.student_status || "").toLowerCase() === "suspended") {
      return res.status(401).json({
        success: false,
        code: "STUDENT_SUSPENDED",
        message: "Your student account is suspended. Sign-in is disabled until the school lifts the suspension.",
      });
    }

    const department_ids = await loadUserDepartmentIds(user.id, user.department_id);
    user.department_ids = department_ids;
    if (!user.department_id && department_ids.length) {
      user.department_id = department_ids[0];
    }

    req.userId = user.id;
    req.user = user;
    req.userType = "user";

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      code: "TOKEN_INVALID",
    });
  }
};

exports.authenticateToken = exports.authenticateUser;
exports.authenticateAdmin = exports.authenticateUser;

exports.optionalAuth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type === "user") {
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ["password_hash"] },
      });

      if (user && user.is_active) {
        const department_ids = await loadUserDepartmentIds(user.id, user.department_id);
        user.department_ids = department_ids;
        if (!user.department_id && department_ids.length) {
          user.department_id = department_ids[0];
        }
        req.userId = user.id;
        req.user = user;
        req.userType = "user";
      }
    }

    next();
  } catch (error) {
    next();
  }
};

exports.authorizeRoles = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    // System admin manages every office module.
    if (req.user.role === ADMIN_ROLE) return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    next();
  };
};

exports.requireAdmin = (req, res, next) => {
  if (req.userType !== "user" || req.user?.role !== ADMIN_ROLE) {
    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  }
  next();
};

exports.requireAdminOrHigher = exports.requireAdmin;

exports.verifyAdminOwnership = (userIdParam = "id") => {
  return (req, res, next) => {
    if (req.user?.role && SCHOOL_ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }

    const resourceUserId =
      req.params[userIdParam] ||
      req.body[userIdParam] ||
      req.query[userIdParam];

    if (!resourceUserId) {
      return next();
    }

    if (resourceUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied, you can only access your own resources",
      });
    }

    next();
  };
};

const requestCounts = new Map();

exports.rateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const key = req.userId || req.ip;
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userData = requestCounts.get(key);

    if (now > userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + windowMs;
      return next();
    }

    if (userData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later",
      });
    }

    userData.count++;
    next();
  };
};

module.exports = exports;
