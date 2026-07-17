const crypto = require("crypto");
const { LiveClassWhiteboard, LiveClassLobbyEntry } = require("../models");
const {
  loadLiveClassForAccess,
  assertCanAccessLiveClass,
  isTeacherRole,
} = require("../services/liveClassAccess");
const { emitToLiveClass } = require("../services/liveClassRealtime");

const MAX_STROKES = 800;
const MAX_POINTS_PER_STROKE = 4000;
const MAX_TEXT_LENGTH = 500;
const MAX_DOCUMENT_LENGTH = 12000;

function sanitizePenStroke(raw, user) {
  if (!raw || typeof raw !== "object") return null;
  const points = Array.isArray(raw.points) ? raw.points : [];
  const cleaned = [];
  for (const p of points.slice(0, MAX_POINTS_PER_STROKE)) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    cleaned.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  }
  if (cleaned.length < 2) return null;

  const color = raw.color != null ? String(raw.color).trim().slice(0, 24) : "#1565c0";
  const width = Math.min(24, Math.max(1, Number(raw.width) || 3));
  const tool = raw.tool === "eraser" ? "eraser" : "pen";

  return {
    id: raw.id && String(raw.id).trim() ? String(raw.id).trim().slice(0, 64) : crypto.randomUUID(),
    user_id: user.id,
    user_name: user.full_name || user.username || "User",
    color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#1565c0",
    width,
    tool,
    points: cleaned,
    created_at: new Date().toISOString(),
  };
}

function sanitizeDocumentStroke(raw, user) {
  if (!raw || typeof raw !== "object") return null;
  const text = raw.text != null ? String(raw.text) : "";

  const color = raw.color != null ? String(raw.color).trim().slice(0, 24) : "#212121";
  const fontSize = Math.min(72, Math.max(10, Number(raw.fontSize) || 18));
  const revision = Math.max(0, Math.floor(Number(raw.revision) || 0));
  const now = new Date().toISOString();

  return {
    id: raw.id && String(raw.id).trim() ? String(raw.id).trim().slice(0, 64) : crypto.randomUUID(),
    user_id: user.id,
    user_name: user.full_name || user.username || "User",
    tool: "document",
    text: text.slice(0, MAX_DOCUMENT_LENGTH),
    x: 0,
    y: 0,
    fontSize,
    revision: 0,
    color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#212121",
    created_at: now,
    updated_at: now,
  };
}

function sanitizeTextStroke(raw, user) {
  if (!raw || typeof raw !== "object") return null;
  const text = raw.text != null ? String(raw.text).trim() : "";
  if (!text) return null;

  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const color = raw.color != null ? String(raw.color).trim().slice(0, 24) : "#1565c0";
  const fontSize = Math.min(72, Math.max(10, Number(raw.fontSize) || 18));

  return {
    id: raw.id && String(raw.id).trim() ? String(raw.id).trim().slice(0, 64) : crypto.randomUUID(),
    user_id: user.id,
    user_name: user.full_name || user.username || "User",
    tool: "text",
    text: text.slice(0, MAX_TEXT_LENGTH),
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    fontSize,
    color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#1565c0",
    created_at: new Date().toISOString(),
  };
}

function sanitizeStroke(raw, user) {
  if (raw?.tool === "document") return sanitizeDocumentStroke(raw, user);
  if (raw?.tool === "text") return sanitizeTextStroke(raw, user);
  return sanitizePenStroke(raw, user);
}

async function getOrCreateBoard(liveClassId) {
  let board = await LiveClassWhiteboard.findOne({ where: { live_class_id: liveClassId } });
  if (!board) {
    board = await LiveClassWhiteboard.create({ live_class_id: liveClassId, strokes: [] });
  }
  return board;
}

async function assertCanAnnotate(req, liveClassId) {
  if (isTeacherRole(req)) return;
  if (req.user.role !== "student") {
    const err = new Error("Only admitted students can annotate.");
    err.statusCode = 403;
    throw err;
  }
  const entry = await LiveClassLobbyEntry.findOne({
    where: { live_class_id: liveClassId, user_id: req.user.id },
    order: [["created_at", "DESC"]],
    attributes: ["status"],
  });
  if (!entry || entry.status !== "admitted") {
    const err = new Error("You must be admitted to the class before using the whiteboard.");
    err.statusCode = 403;
    throw err;
  }
}

exports.getLiveClassWhiteboard = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const board = await getOrCreateBoard(id);
    const strokes = Array.isArray(board.strokes) ? board.strokes : [];

    return res.json({
      success: true,
      data: {
        live_class_id: id,
        strokes,
        can_annotate: isTeacherRole(req) || req.user.role === "student",
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.postLiveClassWhiteboardStroke = async (req, res) => {
  try {
    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);
    await assertCanAnnotate(req, id);

    const stroke = sanitizeStroke(req.body?.stroke || req.body, req.user);
    if (!stroke) {
      return res.status(400).json({ success: false, message: "Invalid annotation payload." });
    }

    const board = await getOrCreateBoard(id);
    const strokes = Array.isArray(board.strokes) ? [...board.strokes] : [];
    const existingIdx = strokes.findIndex((s) => s.id === stroke.id);
    if (stroke.tool === "document") {
      const previous = existingIdx >= 0 ? strokes[existingIdx] : null;
      stroke.revision = (Number(previous?.revision) || 0) + 1;
      stroke.updated_at = new Date().toISOString();
    }
    if (existingIdx >= 0) {
      strokes[existingIdx] = stroke;
    } else {
      strokes.push(stroke);
    }
    const trimmed = strokes.length > MAX_STROKES ? strokes.slice(strokes.length - MAX_STROKES) : strokes;
    await board.update({ strokes: trimmed });

    emitToLiveClass(id, "live-whiteboard:stroke", { stroke, live_class_id: id });

    return res.status(201).json({ success: true, data: stroke });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.clearLiveClassWhiteboard = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isTeacherRole(req)) {
      return res.status(403).json({ success: false, message: "Only staff can clear the whiteboard." });
    }

    const live = await loadLiveClassForAccess(id);
    await assertCanAccessLiveClass(req, live);

    const board = await getOrCreateBoard(id);
    await board.update({ strokes: [] });

    emitToLiveClass(id, "live-whiteboard:clear", { live_class_id: id });

    return res.json({ success: true, data: { strokes: [] } });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
