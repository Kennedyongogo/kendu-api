const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { User } = require("../models");

async function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization &&
        String(socket.handshake.headers.authorization).replace(/^Bearer\s+/i, ""));
    if (!token) {
      return next(new Error("Authentication required"));
    }
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.type !== "user") {
      return next(new Error("Invalid token type"));
    }
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password_hash"] },
    });
    if (!user || !user.is_active) {
      return next(new Error("User not found or inactive"));
    }
    socket.user = {
      id: user.id,
      role: user.role,
      username: user.username,
      full_name: user.full_name,
    };
    return next();
  } catch (err) {
    return next(new Error(err.message || "Authentication failed"));
  }
}

module.exports = { socketAuthMiddleware };
