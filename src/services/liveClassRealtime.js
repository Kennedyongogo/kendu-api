function emitToLiveClass(liveClassId, event, payload) {
  try {
    const { getIO } = require("../realtime/socketServer");
    getIO().to(`live:${liveClassId}`).emit(event, payload);
  } catch (_) {
    /* socket optional */
  }
}

function emitToUser(userId, event, payload) {
  if (!userId) return;
  try {
    const { getIO } = require("../realtime/socketServer");
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch (_) {
    /* socket optional */
  }
}

module.exports = { emitToLiveClass, emitToUser };
