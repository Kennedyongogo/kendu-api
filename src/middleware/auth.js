const jwt = require("jsonwebtoken");
const { User } = require("../models");
const config = require("../config/config");

const ADMIN_ROLE = "admin";
const STAFF_ROLES = ["admin", "staff"];
const ADMIN_PORTAL_API_ROLES = ["admin", "staff"];
const ADMIN_PORTAL_LOGIN_BLOCKED_ROLES = ["student"];
const PUBLIC_PORTAL_ALLOWED_ROLES = ["student"];
const SCHOOL_ADMIN_ROLES = ["admin"];
const ALL_USER_ROLES = ["admin", "staff", "student"];

exports.ADMIN_ROLE = ADMIN_ROLE;
exports.STAFF_ROLES = STAFF_ROLES;
exports.ADMIN_PORTAL_API_ROLES = ADMIN_PORTAL_API_ROLES;
exports.ADMIN_PORTAL_LOGIN_BLOCKED_ROLES = ADMIN_PORTAL_LOGIN_BLOCKED_ROLES;
exports.PUBLIC_PORTAL_ALLOWED_ROLES = PUBLIC_PORTAL_ALLOWED_ROLES;
exports.SCHOOL_ADMIN_ROLES = SCHOOL_ADMIN_ROLES;
exports.ALL_USER_ROLES = ALL_USER_ROLES;

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
      return res.status(403).json({
        success: false,
        message: "Access denied, invalid or inactive user",
      });
    }

    req.userId = user.id;
    req.user = user;
    req.userType = "user";

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid token",
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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    next();
  };
};

exports.requireAdmin = (req, res, next) => {
  if (req.userType !== "user" || !STAFF_ROLES.includes(req.user.role)) {
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
