const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const { Op } = require("sequelize");
const { ProctoringRecording, ProctoringSession, ExamAttempt, Student } = require("../models");

exports.uploadRecordingChunkMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
}).single("video");

const includes = [
  {
    model: ProctoringSession,
    as: "proctoring_session",
    include: [{ model: ExamAttempt, as: "exam_attempt", attributes: ["id", "exam_id", "student_id"] }],
  },
];

async function sessionIdsForStudent(req) {
  const profile = await Student.findOne({ where: { user_id: req.user.id } });
  if (!profile) return [];
  const attempts = await ExamAttempt.findAll({
    where: { student_id: profile.id },
    attributes: ["id"],
  });
  const attemptIds = attempts.map((a) => a.id);
  if (attemptIds.length === 0) return [];
  const sessions = await ProctoringSession.findAll({
    where: { exam_attempt_id: { [Op.in]: attemptIds } },
    attributes: ["id"],
  });
  return sessions.map((s) => s.id);
}

exports.listProctoringRecordings = async (req, res) => {
  try {
    const where = {};
    if (req.query.ai_analysis_status) where.ai_analysis_status = req.query.ai_analysis_status;

    if (req.user.role === "student") {
      const sids = await sessionIdsForStudent(req);
      if (sids.length === 0) {
        return res.json({ success: true, data: [] });
      }
      if (req.query.proctoring_session_id) {
        if (!sids.includes(req.query.proctoring_session_id)) {
          return res.json({ success: true, data: [] });
        }
        where.proctoring_session_id = req.query.proctoring_session_id;
      } else {
        where.proctoring_session_id = { [Op.in]: sids };
      }
    } else if (req.query.proctoring_session_id) {
      where.proctoring_session_id = req.query.proctoring_session_id;
    }

    const rows = await ProctoringRecording.findAll({
      where,
      include: includes,
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProctoringRecording = async (req, res) => {
  try {
    const row = await ProctoringRecording.findByPk(req.params.id, { include: includes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring recording not found" });
    }
    if (req.user.role === "student") {
      const sids = await sessionIdsForStudent(req);
      if (!sids.includes(row.proctoring_session_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProctoringRecording = async (req, res) => {
  try {
    const row = await ProctoringRecording.create(req.body);
    const created = await ProctoringRecording.findByPk(row.id, { include: includes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateProctoringRecording = async (req, res) => {
  try {
    const row = await ProctoringRecording.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring recording not found" });
    }
    const allowed = [
      "recording_url",
      "recording_type",
      "file_size_bytes",
      "duration_seconds",
      "storage_path",
      "thumbnail_url",
      "ai_analysis_status",
      "ai_flags",
      "chunk_number",
      "is_final",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    const updated = await ProctoringRecording.findByPk(row.id, { include: includes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.uploadRecordingChunk = async (req, res) => {
  try {
    const examAttemptId = req.body.exam_attempt_id || req.body.examAttemptId;
    const chunkRaw = req.body.chunk_number ?? req.body.chunkNumber;
    const chunkNumber = chunkRaw !== undefined ? parseInt(String(chunkRaw), 10) : NaN;

    if (!examAttemptId || Number.isNaN(chunkNumber)) {
      return res.status(400).json({
        success: false,
        message: "exam_attempt_id (or examAttemptId) and chunk_number (or chunkNumber) are required",
      });
    }

    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: "Video file (field: video) is required" });
    }

    const profile = await Student.findOne({ where: { user_id: req.user.id } });
    if (!profile) {
      return res.status(403).json({ success: false, message: "Student profile required" });
    }

    const attempt = await ExamAttempt.findByPk(examAttemptId);
    if (!attempt || attempt.student_id !== profile.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const session = await ProctoringSession.findOne({ where: { exam_attempt_id: examAttemptId } });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Proctoring session not found for this attempt; create a session before uploading chunks",
      });
    }

    const relativeDir = path.join("proctoring-recordings", examAttemptId);
    const absRoot = path.join(__dirname, "..", "..", "uploads", relativeDir);
    await fs.mkdir(absRoot, { recursive: true });

    const filename = `chunk-${chunkNumber}.webm`;
    const absPath = path.join(absRoot, filename);
    await fs.writeFile(absPath, req.file.buffer);

    const recording_url = `/uploads/${relativeDir.replace(/\\/g, "/")}/${filename}`;

    const row = await ProctoringRecording.create({
      proctoring_session_id: session.id,
      recording_url,
      recording_type: "webcam",
      file_size_bytes: req.file.buffer.length,
      storage_path: absPath,
      chunk_number: chunkNumber,
      is_final: false,
    });

    await session.update({ recording_started: true });

    const created = await ProctoringRecording.findByPk(row.id, { include: includes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteProctoringRecording = async (req, res) => {
  try {
    const row = await ProctoringRecording.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring recording not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Proctoring recording deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
