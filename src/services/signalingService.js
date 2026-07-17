const webrtcRoomService = require("./webrtcRoomService");

class SignalingService {
  constructor() {
    /** @type {Map<string, Set<string>>} roomId -> socket ids */
    this.rooms = new Map();
    /** @type {Map<string, string>} socketId -> roomId */
    this.socketToRoom = new Map();
    /** @type {Map<string, object>} socketId -> participant */
    this.participants = new Map();
  }

  roomKey(meetingId) {
    return webrtcRoomService.socketRoomName(meetingId);
  }

  initialize(io) {
    io.on("connection", (socket) => {
      const attachRoom = (meetingId, meta = {}) => {
        const roomId = this.roomKey(meetingId);
        if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
        this.rooms.get(roomId).add(socket.id);
        this.socketToRoom.set(socket.id, roomId);
        const displayName =
          (meta.userName && String(meta.userName).trim()) ||
          (socket.user?.full_name && String(socket.user.full_name).trim()) ||
          (socket.user?.username && String(socket.user.username).trim()) ||
          "Guest";
        this.participants.set(socket.id, {
          socketId: socket.id,
          userId: socket.user?.id,
          userName: displayName,
          role: meta.role || socket.user?.role || "participant",
          liveClassId: meta.liveClassId || null,
        });
        socket.join(roomId);
        if (meta.liveClassId) {
          socket.join(`live:${meta.liveClassId}`);
        }
        return roomId;
      };

      const detachRoom = () => {
        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return null;
        this.rooms.get(roomId)?.delete(socket.id);
        if (this.rooms.get(roomId)?.size === 0) this.rooms.delete(roomId);
        const participant = this.participants.get(socket.id);
        this.socketToRoom.delete(socket.id);
        this.participants.delete(socket.id);
        socket.to(roomId).emit("user-left", {
          socketId: socket.id,
          userId: participant?.userId,
          userName: participant?.userName,
        });
        return { roomId, participant };
      };

      socket.on("join-webrtc-room", (payload = {}) => {
        const meetingId = payload.meetingId != null ? String(payload.meetingId).trim() : "";
        if (!meetingId) return;
        const prev = detachRoom();
        if (prev?.roomId) socket.leave(prev.roomId);

        const roomId = attachRoom(meetingId, {
          userName: payload.userName,
          role: payload.role,
          liveClassId: payload.liveClassId,
        });

        const others = Array.from(this.rooms.get(roomId) || [])
          .filter((id) => id !== socket.id)
          .map((id) => this.participants.get(id))
          .filter(Boolean);

        socket.to(roomId).emit("user-joined", {
          socketId: socket.id,
          userId: socket.user?.id,
          userName: this.participants.get(socket.id)?.userName,
          role: this.participants.get(socket.id)?.role,
        });

        socket.emit("room-participants", others);
      });

      socket.on("offer", ({ to, offer }) => {
        if (!to || !offer) return;
        io.to(to).emit("offer", { from: socket.id, offer });
      });

      socket.on("answer", ({ to, answer }) => {
        if (!to || !answer) return;
        io.to(to).emit("answer", { from: socket.id, answer });
      });

      socket.on("ice-candidate", ({ to, candidate }) => {
        if (!to || !candidate) return;
        io.to(to).emit("ice-candidate", { from: socket.id, candidate });
      });

      socket.on("leave-webrtc-room", () => {
        const left = detachRoom();
        if (left?.roomId) socket.leave(left.roomId);
      });

      socket.on("disconnect", () => {
        const left = detachRoom();
        if (left?.roomId) socket.leave(left.roomId);
      });

      // Legacy room joins (proctor / presence)
      socket.on("join:proctor", (examAttemptId) => {
        if (!examAttemptId) return;
        socket.join(`proctor:${examAttemptId}`);
      });
      socket.on("leave:proctor", (examAttemptId) => {
        if (!examAttemptId) return;
        socket.leave(`proctor:${examAttemptId}`);
      });
      socket.on("join:live-class", (liveClassId) => {
        if (!liveClassId) return;
        socket.join(`live:${liveClassId}`);
      });
      socket.on("leave:live-class", (liveClassId) => {
        if (!liveClassId) return;
        socket.leave(`live:${liveClassId}`);
      });
      const joinExamRoom = (examId) => {
        if (!examId) return;
        socket.join(`exam:${examId}`);
      };
      const leaveExamRoom = (examId) => {
        if (!examId) return;
        socket.leave(`exam:${examId}`);
      };
      socket.on("join:exam-schedule", joinExamRoom);
      socket.on("leave:exam-schedule", leaveExamRoom);
      socket.on("join:exam", joinExamRoom);
      socket.on("leave:exam", leaveExamRoom);
      socket.on("join:event", (eventId) => {
        if (!eventId) return;
        socket.join(`event:${eventId}`);
      });
      socket.on("leave:event", (eventId) => {
        if (!eventId) return;
        socket.leave(`event:${eventId}`);
      });
      socket.on("join:admin-meeting", (meetingId) => {
        if (!meetingId) return;
        socket.join(`admin-meeting:${meetingId}`);
      });
      socket.on("leave:admin-meeting", (meetingId) => {
        if (!meetingId) return;
        socket.leave(`admin-meeting:${meetingId}`);
      });
      if (socket.user?.id) {
        socket.join(`user:${socket.user.id}`);
      }
      socket.on("join:presence", (sectionId) => {
        if (!sectionId) return;
        socket.join(`presence:${sectionId}`);
      });
    });
  }
}

module.exports = new SignalingService();
