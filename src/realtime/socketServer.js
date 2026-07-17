const { Server } = require("socket.io");
const { socketAuthMiddleware } = require("../middleware/socketAuth");
const signalingService = require("../services/signalingService");

let io;

function attachSocket(httpServer, options = {}) {
  io = new Server(httpServer, {
    cors: {
      origin: options.origin ?? process.env.CORS_ORIGIN ?? "*",
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    },
    transports: ["websocket", "polling"],
  });

  io.use(socketAuthMiddleware);
  signalingService.initialize(io);

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.IO has not been initialized; call attachSocket(server) after listen()");
  }
  return io;
}

module.exports = { attachSocket, getIO };
