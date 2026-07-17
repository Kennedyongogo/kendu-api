function emitToExamSchedule(examScheduleId, event, payload) {
  try {
    const { getIO } = require("../realtime/socketServer");
    getIO().to(`exam:${examScheduleId}`).emit(event, payload);
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

module.exports = { emitToExamSchedule, emitToUser };
