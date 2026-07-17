const {
  sequelize,
  Exam,
  ExamTemplate,
  ExamQuestion,
  ExamSubmission,
  ExamAnswer,
  ExamAttempt,
  ExamSessionLog,
  StudentExamResult,
  Teacher,
  Student,
  User,
} = require("../models");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { convertToRelativePath } = require("../utils/filePath");
const OpenAI = require("openai");
const { parsePdfBuffer } = require("../utils/pdfParseBuffer");
const {
  parseManualPdfAnswers,
  submissionHasManualPdfEntries,
} = require("../utils/pdfManualAnswers");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const { Op } = require("sequelize");

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
});

const userSafe = { attributes: { exclude: ["password_hash"] } };
const QUESTION_TYPES = new Set([
  "multiple_choice",
  "multi_select",
  "true_false",
  "essay",
  "short_text",
  "long_text",
  "number",
  "diagram_label",
  "file_upload",
]);
const EXAM_STATUS = new Set(["draft", "published", "archived"]);
const SESSION_STATUS = new Set(["scheduled", "live", "completed", "cancelled"]);

const { examDetailIncludes, examListIncludes } = require("../utils/examIncludes");
const { resolveExamMeetingUrls } = require("../utils/examMeeting");
const {
  applyProctoringToPayload,
  normalizeMode,
  usesActivityMonitor,
  usesLiveVideoInvigilation,
  markActivityExamInvigilatorPresent,
} = require("../utils/examProctoring");
const {
  autoSubmitElapsedDraftIfNeeded,
  buildStudentExamAccess,
  syncProctoringAttemptWithSubmission,
  logProctoringEvent,
} = require("../utils/examSubmissionDuration");
const { isPdfFormExam, EXAM_PDF_FORM_TYPE, hasManualPdfSubmissionContent } = require("../utils/examPdfForm");
const { finalizePdfFormSubmission } = require("./examPdfFormController");
const {
  normalizeAssignedStudentIds,
  isStudentAssignedToExam,
  isWithinExamScheduleWindow,
  isBeforeExamScheduleStart,
  validateAndNormalizeAssignedStudentIds,
  pickStudentExamSubmission,
} = require("../utils/examAssignedStudents");

function meetingFieldsForProctoringMode(examRow, proctoringMode) {
  const mode = normalizeMode(proctoringMode ?? examRow?.proctoring_mode);
  if (usesLiveVideoInvigilation(mode)) {
    const urls = resolveExamMeetingUrls({}, examRow, { preferLiveKit: true });
    if (urls.meeting_join_url) {
      return {
        meeting_provider: urls.meeting_provider,
        meeting_id: urls.meeting_id,
        meeting_join_url: urls.meeting_join_url,
        meeting_host_url: urls.meeting_host_url,
      };
    }
    return {};
  }
  if (usesActivityMonitor(mode)) {
    return {
      meeting_provider: null,
      meeting_id: null,
      meeting_join_url: null,
      meeting_host_url: null,
    };
  }
  return {};
}

async function ensureExamAttemptForProctoring(exam, studentId, submission = null) {
  if (submission) {
    return syncProctoringAttemptWithSubmission(exam, studentId, submission);
  }
  const mode = normalizeMode(exam?.proctoring_mode);
  if (!usesActivityMonitor(mode)) return null;
  const now = new Date();
  let attempt = await ExamAttempt.findOne({
    where: { exam_id: exam.id, student_id: studentId },
    order: [["created_at", "DESC"]],
  });
  if (!attempt) {
    attempt = await ExamAttempt.create({
      exam_id: exam.id,
      student_id: studentId,
      status: "in_progress",
      start_time: now,
      last_activity_at: now,
      client_presence_active: true,
      webcam_enabled: false,
    });
    await logProctoringEvent(attempt, "session_start", { source: "portal_exam_start" });
    return attempt;
  }
  if (!attempt.start_time || attempt.status === "pending") {
    await attempt.update({
      status: "in_progress",
      start_time: attempt.start_time || now,
      last_activity_at: now,
      client_presence_active: true,
    });
    const startLog = await ExamSessionLog.findOne({
      where: { exam_attempt_id: attempt.id, event_type: "session_start" },
      attributes: ["id"],
    });
    if (!startLog) await logProctoringEvent(attempt, "session_start", { source: "portal_exam_start" });
  }
  return attempt;
}

const { normalizeWallClockToDate } = require("../utils/examScheduleTime");

const applySchedulingFields = (body, payload, isCreate, userId) => {
  const src = body && typeof body === "object" ? body : {};
  const set = (key, val) => {
    if (val !== undefined) payload[key] = val;
  };
  set("teacher_id", src.teacher_id);
  set("timezone", src.timezone);
  const scheduleTimezone =
    src.timezone !== undefined && src.timezone !== null && String(src.timezone).trim() !== ""
      ? String(src.timezone).trim()
      : payload.timezone || "Africa/Nairobi";
  if (src.start_time !== undefined) {
    set("start_time", normalizeWallClockToDate(src.start_time, scheduleTimezone));
  }
  if (src.end_time !== undefined) {
    set("end_time", normalizeWallClockToDate(src.end_time, scheduleTimezone));
  }
  set("is_active", src.is_active);
  set("proctoring_mode", src.proctoring_mode);
  set("proctoring_rules_json", src.proctoring_rules_json);
  set("meeting_provider", src.meeting_provider);
  set("meeting_id", src.meeting_id);
  set("meeting_join_url", src.meeting_join_url);
  set("meeting_host_url", src.meeting_host_url);
  if (src.requires_webcam !== undefined) set("requires_webcam", src.requires_webcam);
  if (src.prevent_tab_switch !== undefined) set("prevent_tab_switch", src.prevent_tab_switch);
  if (src.session_status !== undefined) {
    const ss = String(src.session_status || "").trim();
    if (ss === "" || ss === "null") payload.session_status = null;
    else if (SESSION_STATUS.has(ss)) payload.session_status = ss;
  }
  if (isCreate) {
    if (payload.timezone === undefined) payload.timezone = "Africa/Nairobi";
    if (payload.proctoring_mode === undefined) payload.proctoring_mode = "record_only";
    if (payload.is_active === undefined) payload.is_active = true;
    if (payload.session_status === undefined && (payload.start_time || payload.teacher_id)) {
      payload.session_status = "scheduled";
    }
    if (userId) payload.created_by = userId;
  } else if (userId) {
    payload.updated_by = userId;
  }
};

const normalizeQuestion = (q, idx = 0) => {
  const question_type = String(q?.question_type || "short_text");
  if (!QUESTION_TYPES.has(question_type)) {
    throw new Error(`Unsupported question type at question ${idx + 1}`);
  }
  const question_text = String(q?.question_text || "").trim();
  if (!question_text) {
    throw new Error(`Question text is required at question ${idx + 1}`);
  }
  let options = Array.isArray(q?.options) ? q.options : Array.isArray(q?.options_json) ? q.options_json : null;
  if (question_type === "diagram_label") {
    const diagramData = String(q?.diagram_data || q?.options?.diagram_data || q?.options_json?.diagram_data || "").trim();
    const diagramPositionSrc = q?.diagram_position || q?.options?.diagram_position || q?.options_json?.diagram_position || {};
    const rawHotspots = Array.isArray(q?.diagram_hotspots)
      ? q.diagram_hotspots
      : Array.isArray(q?.options?.hotspots)
      ? q.options.hotspots
      : Array.isArray(q?.options_json?.hotspots)
      ? q.options_json.hotspots
      : [];
    const hotspots = rawHotspots.map((hs, i) => ({
      id: hs?.id || `hs-${idx + 1}-${i + 1}`,
      x: Number.isFinite(Number(hs?.x)) ? Number(hs.x) : 50,
      y: Number.isFinite(Number(hs?.y)) ? Number(hs.y) : 50,
      prompt: String(hs?.prompt || "").trim(),
      correct_answer: String(hs?.correct_answer || "").trim(),
    }));
    if (!diagramData) throw new Error(`Diagram drawing is required at question ${idx + 1}`);
    if (!hotspots.length) throw new Error(`At least one diagram hotspot is required at question ${idx + 1}`);
    options = {
      diagram_data: diagramData,
      hotspots,
      diagram_position: {
        x: Number.isFinite(Number(diagramPositionSrc?.x)) ? Number(diagramPositionSrc.x) : 40,
        y: Number.isFinite(Number(diagramPositionSrc?.y)) ? Number(diagramPositionSrc.y) : 220,
        w: Number.isFinite(Number(diagramPositionSrc?.w)) ? Math.max(120, Number(diagramPositionSrc.w)) : 260,
        h: Number.isFinite(Number(diagramPositionSrc?.h)) ? Math.max(80, Number(diagramPositionSrc.h)) : 180,
        page: Number.isFinite(Number(diagramPositionSrc?.page)) ? Math.max(0, Number(diagramPositionSrc.page)) : 0,
      },
    };
  }
  if (question_type === "file_upload") {
    const rawAccept = Array.isArray(q?.options?.accept) ? q.options.accept : null;
    const accept =
      rawAccept && rawAccept.length
        ? rawAccept.map((a) => String(a).trim()).filter(Boolean)
        : ["image/*", "application/pdf"];
    const max_files = Math.min(5, Math.max(1, Number(q?.options?.max_files) || 1));
    const max_size_mb = Math.min(25, Math.max(1, Number(q?.options?.max_size_mb) || 10));
    const upload_hint = q?.options?.upload_hint != null ? String(q.options.upload_hint).trim() : "";
    options = { accept, max_files, max_size_mb, upload_hint };
  }
  return {
    question_text,
    question_type,
    options,
    correct_answer: q?.correct_answer != null ? String(q.correct_answer) : null,
    marks: Number.isFinite(Number(q?.marks)) ? Number(q.marks) : 0,
    order_number: Number.isFinite(Number(q?.order_number)) ? Number(q.order_number) : idx + 1,
    explanation: q?.explanation ? String(q.explanation) : null,
    required: Boolean(q?.required),
    canvas_x: Number.isFinite(Number(q?.canvas_x)) ? Number(q.canvas_x) : 40,
    canvas_y: Number.isFinite(Number(q?.canvas_y)) ? Number(q.canvas_y) : 120 + idx * 34,
    canvas_w: Number.isFinite(Number(q?.canvas_w)) ? Math.max(120, Number(q.canvas_w)) : 520,
    canvas_h: Number.isFinite(Number(q?.canvas_h)) ? Math.max(24, Number(q.canvas_h)) : 26,
    canvas_page: Number.isFinite(Number(q?.canvas_page)) ? Math.max(0, Number(q.canvas_page)) : 0,
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_RE.test(String(value || "").trim());

/** Update/create exam questions in place so existing student answers stay linked. */
const syncExamQuestions = async (examId, questionsPayload, transaction) => {
  const normalizedQuestions = questionsPayload.map((q, i) => normalizeQuestion(q, i));
  const existing = await ExamQuestion.findAll({
    where: { exam_id: examId },
    order: [
      ["order_number", "ASC"],
      ["created_at", "ASC"],
    ],
    transaction,
  });
  const existingById = new Map(existing.map((q) => [q.id, q]));
  const claimedIds = new Set();

  for (let i = 0; i < normalizedQuestions.length; i += 1) {
    const data = normalizedQuestions[i];
    const rawId = questionsPayload[i]?.id;
    let questionId = isUuid(rawId) && existingById.has(rawId) ? rawId : null;
    if (!questionId) {
      const byOrder = existing.find(
        (row) => row.order_number === data.order_number && !claimedIds.has(row.id)
      );
      if (byOrder) questionId = byOrder.id;
    }
    if (!questionId && existing[i] && !claimedIds.has(existing[i].id)) {
      questionId = existing[i].id;
    }

    if (questionId) {
      claimedIds.add(questionId);
      await ExamQuestion.update(data, { where: { id: questionId, exam_id: examId }, transaction });
    } else {
      const created = await ExamQuestion.create({ ...data, exam_id: examId }, { transaction });
      claimedIds.add(created.id);
    }
  }

  for (const row of existing) {
    if (claimedIds.has(row.id)) continue;
    const answerCount = await ExamAnswer.count({ where: { question_id: row.id }, transaction });
    if (answerCount > 0) continue;
    await ExamQuestion.destroy({ where: { id: row.id }, transaction });
  }
};

const normalizeExamLayout = (layout = {}) => {
  const src = layout && typeof layout === "object" ? layout : {};
  const def = {
    name: { x: 40, y: 80, w: 300, h: 24 },
    instructions: { x: 40, y: 115, w: 520, h: 30 },
    duration: { x: 420, y: 80, w: 140, h: 24 },
    passing_marks: { x: 40, y: 160, w: 180, h: 24 },
    total_marks: { x: 230, y: 160, w: 180, h: 24 },
  };
  const out = {};
  for (const key of Object.keys(def)) {
    const row = src[key] || {};
    out[key] = {
      x: Number.isFinite(Number(row.x)) ? Number(row.x) : def[key].x,
      y: Number.isFinite(Number(row.y)) ? Number(row.y) : def[key].y,
      w: Number.isFinite(Number(row.w)) ? Math.max(120, Number(row.w)) : def[key].w,
      h: Number.isFinite(Number(row.h)) ? Math.max(24, Number(row.h)) : def[key].h,
    };
  }
  if (Array.isArray(src.template_pages_override)) {
    out.template_pages_override = src.template_pages_override.map((p) => ({
      id: p?.id || undefined,
      elements: Array.isArray(p?.elements) ? p.elements : [],
    }));
  }
  return out;
};

const findStudentByUser = async (userId) => {
  if (!userId) return null;
  return Student.findOne({ where: { user_id: userId } });
};

const hasMeaningfulAnswer = (ans) => {
  const hasText = Boolean(String(ans?.answer_text || "").trim());
  const json = ans?.answer_json;
  if (json == null) return hasText;
  if (Array.isArray(json)) return hasText || json.length > 0;
  if (typeof json === "object") {
    if (Array.isArray(json.files) && json.files.length > 0) return true;
    const vals = Object.values(json || {}).filter((_, k) => k !== "files");
    return hasText || vals.some((v) => String(v ?? "").trim() !== "");
  }
  return hasText || String(json).trim() !== "";
};

function mimeMatchesAccept(mimetype, acceptList) {
  const mime = String(mimetype || "").toLowerCase();
  const list = Array.isArray(acceptList) ? acceptList : ["image/*", "application/pdf"];
  return list.some((pattern) => {
    const p = String(pattern || "").toLowerCase().trim();
    if (!p) return false;
    if (p.endsWith("/*")) {
      const prefix = p.slice(0, -1);
      return mime.startsWith(prefix);
    }
    return mime === p;
  });
}

exports.generateDiagramImage = async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ success: false, message: "Prompt is required." });
    }

    const mimeType = String(req.body?.mimeType || "image/png");
    const sizeHint = String(req.body?.size || "1024x1024");
    const [wStr, hStr] = String(sizeHint).toLowerCase().split("x");
    const width = Math.max(256, Math.min(2048, Number(wStr) || 1024));
    const height = Math.max(256, Math.min(2048, Number(hStr) || 1024));
    const generationNonce = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const makeSvgFallback = (title) => {
      const safe = String(title || "Diagram").replace(/[<>&]/g, "");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="24" y="24" width="${Math.max(120, width - 48)}" height="${Math.max(120, height - 48)}" fill="none" stroke="#111827" stroke-width="2"/>
  <text x="40" y="70" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">Auto Diagram Placeholder</text>
  <text x="40" y="120" font-family="Arial, sans-serif" font-size="20" fill="#374151">Prompt:</text>
  <foreignObject x="40" y="140" width="${Math.max(200, width - 80)}" height="${Math.max(120, height - 180)}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 18px; color: #111827; line-height: 1.35; white-space: pre-wrap;">${safe}</div>
  </foreignObject>
</svg>`;
      const base64 = Buffer.from(svg, "utf8").toString("base64");
      return {
        mimeType: "image/svg+xml",
        base64,
        dataUrl: `data:image/svg+xml;base64,${base64}`,
      };
    };

    // ========== 1) PRIMARY: Vercel AI Gateway (Grok Imagine) ==========
    const vercelApiKey = String(process.env.VERCEL_AI_API_KEY || "").trim();
    if (vercelApiKey) {
      try {
        console.log("🎨 Generating image with Vercel AI Gateway / Grok...");

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const vercelRes = await axios.post(
              "https://gateway.ai.vercel.ai/v1/images/generations",
              {
                model: "xai/grok-imagine-image",
                prompt: `Create a clean educational diagram for exam use. Keep background white, text readable, and labels clear. ${prompt}\nVariation token: ${generationNonce}`,
                n: 1,
                size: `${width}x${height}`,
              },
              {
                headers: {
                  Authorization: `Bearer ${vercelApiKey}`,
                  "Content-Type": "application/json",
                },
                timeout: 45000,
              }
            );

            const imageUrl = vercelRes?.data?.data?.[0]?.url;
            if (!imageUrl) throw new Error("Vercel returned no image URL.");
            const imageResponse = await axios.get(imageUrl, {
              responseType: "arraybuffer",
              timeout: 30000,
            });
            const base64Image = Buffer.from(imageResponse.data, "binary").toString("base64");
            const outMime = imageResponse.headers["content-type"] || mimeType;

            console.log("✅ Vercel/Grok image generated successfully!");

            return res.json({
              success: true,
              provider: "vercel-grok",
              modelUsed: "xai/grok-imagine-image",
              data: {
                mimeType: outMime,
                base64: base64Image,
                url: imageUrl,
                dataUrl: `data:${outMime};base64,${base64Image}`,
              },
            });
          } catch (attemptError) {
            const msg = String(attemptError?.message || "");
            const transientTls = /TLS|socket|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(msg);
            if (attempt < 2 && transientTls) {
              await sleep(700);
              continue;
            }
            throw attemptError;
          }
        }
      } catch (vercelError) {
        console.error("⚠️ Vercel AI Gateway failed:", vercelError.response?.data?.error?.message || vercelError.message);
        // Continue to fallback
      }
    }

    // ========== 2) FALLBACK 1: Pollinations (free, no key) ==========
    try {
      console.log("🔄 Falling back to Pollinations...");
      const pollinationsPrompt = encodeURIComponent(
        `Create a clean educational diagram for exam use. Keep background white and labels readable. ${prompt}\nVariation token: ${generationNonce}`
      );
      const pollinationsUrl = `https://image.pollinations.ai/prompt/${pollinationsPrompt}?model=flux&width=${width}&height=${height}&nologo=true&seed=${encodeURIComponent(
        generationNonce
      )}&_=${Date.now()}`;
      const pollinationsImage = await axios.get(pollinationsUrl, {
        responseType: "arraybuffer",
        timeout: 45000,
        headers: { Accept: "image/*" },
      });
      const outMime = pollinationsImage.headers["content-type"] || "image/png";
      const base64Data = Buffer.from(pollinationsImage.data, "binary").toString("base64");
      if (!base64Data) throw new Error("Pollinations returned empty image data.");
      console.log("✅ Pollinations generated image successfully!");
      return res.json({
        success: true,
        provider: "pollinations",
        modelUsed: "flux",
        data: {
          mimeType: outMime,
          base64: base64Data,
          dataUrl: `data:${outMime};base64,${base64Data}`,
        },
      });
    } catch (pollinationsError) {
      console.error("⚠️ Pollinations failed:", pollinationsError.message);
      // Continue to Gemini fallback
    }

    // ========== 3) FALLBACK 2: Gemini (text-only, descriptive fallback) ==========
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (apiKey) {
      try {
        console.log("🔄 Falling back to Gemini for text description...");

        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: `Describe in detail what a diagram showing "${prompt}" should look like for an educational exam. Include labels, layout, and key elements. Return as a JSON object with fields: title, description, labels (array of label objects with x,y,text), and suggested_colors.`,
                  },
                ],
              },
            ],
          },
          { timeout: 30000 }
        );

        const description = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No description generated";

        // Try to parse as JSON if possible
        let parsedDescription = description;
        try {
          const jsonMatch = description.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedDescription = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // Keep as text
        }

        return res.json({
          success: true,
          provider: "gemini-text-fallback",
          note: "Image generation unavailable via Gemini. Returned text description that can be used to draw the diagram on canvas.",
          data: {
            description: parsedDescription,
            rawText: description,
          },
        });
      } catch (geminiError) {
        const status = Number(geminiError?.response?.status || 0);
        if (status === 429) console.error("⚠️ Gemini fallback failed: rate limited (429)");
        else console.error("⚠️ Gemini fallback failed:", geminiError.message);
      }
    }

    // ========== All providers failed -> guaranteed local SVG fallback ==========
    return res.json({
      success: true,
      provider: "local-svg-fallback",
      modelUsed: "local-svg",
      note: "All remote providers failed; returning local placeholder SVG image.",
      data: makeSvgFallback(prompt),
    });
  } catch (error) {
    const upstream = error?.response?.data;
    return res.status(502).json({
      success: false,
      message: upstream?.error?.message || error.message || "Failed to generate diagram image.",
    });
  }
};

// Keep extraction on legacy generateContent-friendly models for broader region/key compatibility.
const EXAM_EXTRACTION_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];

const extractJSONArray = (rawText) => {
  const text = String(rawText || "").trim();
  if (!text) return [];
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const extractDocumentText = async (reqFile, fileBuffer) => {
  const mime = String(reqFile?.mimetype || "").toLowerCase();
  const originalName = String(reqFile?.originalname || "").toLowerCase();
  const asUtf8 = () => String(fileBuffer.toString("utf8") || "").trim();

  if (mime.startsWith("text/")) return asUtf8();
  if (originalName.endsWith(".txt") || originalName.endsWith(".csv") || originalName.endsWith(".md")) return asUtf8();

  if (mime.includes("pdf") || originalName.endsWith(".pdf")) {
    const parsed = await parsePdfBuffer(fileBuffer);
    return String(parsed?.text || "").trim();
  }

  if (
    mime.includes("wordprocessingml.document") ||
    mime.includes("msword") ||
    originalName.endsWith(".docx") ||
    originalName.endsWith(".doc")
  ) {
    const out = await mammoth.extractRawText({ buffer: fileBuffer });
    return String(out?.value || "").trim();
  }

  if (
    mime.startsWith("image/") ||
    originalName.endsWith(".png") ||
    originalName.endsWith(".jpg") ||
    originalName.endsWith(".jpeg") ||
    originalName.endsWith(".webp") ||
    originalName.endsWith(".bmp") ||
    originalName.endsWith(".tif") ||
    originalName.endsWith(".tiff")
  ) {
    const ocrResult = await Tesseract.recognize(fileBuffer, "eng", {});
    return String(ocrResult?.data?.text || "").trim();
  }

  return "";
};

const parseQuestionsFromExtractedText = (text, maxCount = 10) => {
  const cleaned = String(text || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
  if (!cleaned) return [];

  const chunks = cleaned
    .split(/\n(?=\s*(?:Q(?:uestion)?\s*)?\d+[\.\):-]\s+)/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const sourceChunks =
    chunks.length > 1
      ? chunks
      : cleaned
          .split(/\n{2,}/)
          .map((x) => x.trim())
          .filter((x) => x.length >= 10);

  const out = [];
  for (let i = 0; i < sourceChunks.length && out.length < maxCount; i += 1) {
    const questionText = sourceChunks[i].replace(/^\s*(?:Q(?:uestion)?\s*)?\d+[\.\):-]\s*/i, "").trim();
    if (!questionText) continue;
    out.push({
      text: questionText,
      type: "short_text",
      options: [],
      correctAnswer: "",
      marks: 5,
      explanation: "",
      order_number: out.length + 1,
    });
  }
  return out;
};

exports.generateQuestionsFromDocument = async (req, res) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Document file is required." });
    }

    const questionCount = Math.max(1, Math.min(50, Number(req.body?.questionCount) || 10));
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileMime = String(req.file.mimetype || "application/octet-stream");
    const extractedText = await extractDocumentText(req.file, fileBuffer);
    if (!extractedText) {
      return res.status(400).json({
        success: false,
        message: `Unsupported file type for OCR extraction (${fileMime}). Use PDF, DOCX, TXT, or image files.`,
      });
    }
    const parsed = parseQuestionsFromExtractedText(extractedText, questionCount);
    if (!parsed.length) {
      return res.status(422).json({
        success: false,
        message:
          "Text was extracted, but no clear questions were detected. Use numbered questions (1., 2., 3.) or review document quality.",
      });
    }

    return res.json({
      success: true,
      data: parsed,
      provider: "ocr-rules",
      modelUsed: "none",
      meta: {
        extraction: "direct_text_or_ocr",
        extracted_characters: extractedText.length,
        raw_text: extractedText,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed extracting questions from document.",
    });
  } finally {
    if (uploadedPath) {
      fs.promises.unlink(uploadedPath).catch(() => {});
    }
  }
};

function normalizeExtractedQuestions(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((q, idx) => ({
    text: String(q?.text || q?.question || "").trim(),
    type: ["multiple_choice", "true_false", "essay", "short_text"].includes(String(q?.type || "")) ? String(q.type) : "short_text",
    options: Array.isArray(q?.options) ? q.options.map((x) => String(x || "").trim()).filter(Boolean) : [],
    correctAnswer: q?.correctAnswer || q?.correct_answer || "",
    marks: Number.isFinite(Number(q?.marks)) ? Number(q.marks) : 5,
    explanation: q?.explanation || "",
    order_number: idx + 1,
  }));
}

exports.extractQuestionsWithAi = async (req, res) => {
  try {
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, message: "GEMINI_API_KEY is not configured." });
    }

    const examText = String(req.body?.examText || "").trim();
    if (!examText) {
      return res.status(400).json({ success: false, message: "examText is required." });
    }

    const requestedModel = String(req.body?.model || "").trim();
    const modelsToTry = requestedModel ? [requestedModel, ...EXAM_EXTRACTION_MODELS.filter((m) => m !== requestedModel)] : EXAM_EXTRACTION_MODELS;
    const prompt = `
Extract ALL questions from this exam text.

Return as a JSON array where each question has:
- "number": the question number
- "text": the full question text
- "marks": marks if specified (default 5)
- "type": "multiple_choice", "essay", or "true_false"
- "options": array of options for multiple choice (empty otherwise)

EXAM TEXT:
${examText}

Return ONLY valid JSON array, no markdown, no explanation.
`;

    let lastErrorMessage = "No model produced a valid response.";
    for (const model of modelsToTry) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const geminiRes = await axios.post(
          endpoint,
          {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          },
          { timeout: 45000 }
        );

        const parts = geminiRes?.data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p) => typeof p?.text === "string" && p.text.trim());
        const responseText = textPart?.text || "";
        const questions = extractJSONArray(responseText);

        if (questions.length > 0) {
          return res.json({ success: true, data: questions, modelUsed: model });
        }

        lastErrorMessage = "Model returned no parseable JSON array.";
      } catch (error) {
        lastErrorMessage = error?.response?.data?.error?.message || error.message || `Model ${model} failed`;
      }
    }

    return res.status(502).json({ success: false, message: lastErrorMessage });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.markExamAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const answer = await ExamAnswer.findByPk(req.params.answerId);
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found for this submission" });
    }
    const marks = Number(req.body?.marks_obtained);
    if (!Number.isFinite(marks) || marks < 0) {
      return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
    }
    const questionMarks = Number(answer.question?.marks || 0);
    if (questionMarks > 0 && marks > questionMarks) {
      return res.status(400).json({ success: false, message: `marks_obtained cannot exceed question marks (${questionMarks}).` });
    }
    await answer.update({ marks_obtained: marks });
    // Recalculate total score
    const allAnswers = await ExamAnswer.findAll({
      where: { submission_id: submission.id },
      include: [{ model: ExamQuestion, as: "question" }]
    });
    const totalObtained = allAnswers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    const totalPossible = allAnswers.reduce((sum, a) => sum + Number(a.question?.marks || 0), 0);
    let attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: submission.student_id,
        status: "completed",
        start_time: submission.started_at || submission.created_at || new Date(),
        end_time: submission.submitted_at || new Date(),
        submitted_at: submission.submitted_at || new Date(),
      });
    }
    const percentage = totalPossible > 0 ? Number(((totalObtained / totalPossible) * 100).toFixed(2)) : 0;
    const passMark = Number(exam.passing_marks || 0);
    const isPassed = totalObtained >= passMark;
    await attempt.update({
      total_score: totalObtained,
      percentage,
      is_passed: isPassed,
    });
    return res.json({ success: true, data: { marks_obtained: marks, total_score: totalObtained, percentage, is_passed: isPassed } });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.markExamAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const answer = await ExamAnswer.findByPk(req.params.answerId);
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found for this submission" });
    }
    const marks = Number(req.body?.marks_obtained);
    if (!Number.isFinite(marks) || marks < 0) {
      return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
    }
    const questionMarks = Number(answer.question?.marks || 0);
    if (questionMarks > 0 && marks > questionMarks) {
      return res.status(400).json({ success: false, message: `marks_obtained cannot exceed question marks (${questionMarks}).` });
    }
    await answer.update({ marks_obtained: marks });
    // Recalculate total score
    const allAnswers = await ExamAnswer.findAll({
      where: { submission_id: submission.id },
      include: [{ model: ExamQuestion, as: "question" }]
    });
    const totalObtained = allAnswers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    const totalPossible = allAnswers.reduce((sum, a) => sum + Number(a.question?.marks || 0), 0);
    let attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: submission.student_id,
        status: "completed",
        start_time: submission.started_at || submission.created_at || new Date(),
        end_time: submission.submitted_at || new Date(),
        submitted_at: submission.submitted_at || new Date(),
      });
    }
    const percentage = totalPossible > 0 ? Number(((totalObtained / totalPossible) * 100).toFixed(2)) : 0;
    const passMark = Number(exam.passing_marks || 0);
    const isPassed = totalObtained >= passMark;
    await attempt.update({
      total_score: totalObtained,
      percentage,
      is_passed: isPassed,
    });
    return res.json({ success: true, data: { marks_obtained: marks, total_score: totalObtained, percentage, is_passed: isPassed } });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.markExamAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const answer = await ExamAnswer.findByPk(req.params.answerId);
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found for this submission" });
    }
    const marks = Number(req.body?.marks_obtained);
    if (!Number.isFinite(marks) || marks < 0) {
      return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
    }
    const questionMarks = Number(answer.question?.marks || 0);
    if (questionMarks > 0 && marks > questionMarks) {
      return res.status(400).json({ success: false, message: `marks_obtained cannot exceed question marks (${questionMarks}).` });
    }
    await answer.update({ marks_obtained: marks });
    // Recalculate total score
    const allAnswers = await ExamAnswer.findAll({
      where: { submission_id: submission.id },
      include: [{ model: ExamQuestion, as: "question" }]
    });
    const totalObtained = allAnswers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    const totalPossible = allAnswers.reduce((sum, a) => sum + Number(a.question?.marks || 0), 0);
    let attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: submission.student_id,
        status: "completed",
        start_time: submission.started_at || submission.created_at || new Date(),
        end_time: submission.submitted_at || new Date(),
        submitted_at: submission.submitted_at || new Date(),
      });
    }
    const percentage = totalPossible > 0 ? Number(((totalObtained / totalPossible) * 100).toFixed(2)) : 0;
    const passMark = Number(exam.passing_marks || 0);
    const isPassed = totalObtained >= passMark;
    await attempt.update({
      total_score: totalObtained,
      percentage,
      is_passed: isPassed,
    });
    return res.json({ success: true, data: { marks_obtained: marks, total_score: totalObtained, percentage, is_passed: isPassed } });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.markExamAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const answer = await ExamAnswer.findByPk(req.params.answerId);
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found for this submission" });
    }
    const marks = Number(req.body?.marks_obtained);
    if (!Number.isFinite(marks) || marks < 0) {
      return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
    }
    const questionMarks = Number(answer.question?.marks || 0);
    if (questionMarks > 0 && marks > questionMarks) {
      return res.status(400).json({ success: false, message: `marks_obtained cannot exceed question marks (${questionMarks}).` });
    }
    await answer.update({ marks_obtained: marks });
    // Recalculate total score
    const allAnswers = await ExamAnswer.findAll({
      where: { submission_id: submission.id },
      include: [{ model: ExamQuestion, as: "question" }]
    });
    const totalObtained = allAnswers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    const totalPossible = allAnswers.reduce((sum, a) => sum + Number(a.question?.marks || 0), 0);
    let attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: submission.student_id,
        status: "completed",
        start_time: submission.started_at || submission.created_at || new Date(),
        end_time: submission.submitted_at || new Date(),
        submitted_at: submission.submitted_at || new Date(),
      });
    }
    const percentage = totalPossible > 0 ? Number(((totalObtained / totalPossible) * 100).toFixed(2)) : 0;
    const passMark = Number(exam.passing_marks || 0);
    const isPassed = totalObtained >= passMark;
    await attempt.update({
      total_score: totalObtained,
      percentage,
      is_passed: isPassed,
    });
    return res.json({ success: true, data: { marks_obtained: marks, total_score: totalObtained, percentage, is_passed: isPassed } });
  } catch (error) {
    return handleErr(res, error);
  }
};

exports.listExams = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.template_id) where.template_id = req.query.template_id;
    if (req.query.session_status) where.session_status = req.query.session_status;
    if (req.query.curriculum_id) where.curriculum_id = req.query.curriculum_id;
    if (req.query.curriculum_class_id) where.curriculum_class_id = req.query.curriculum_class_id;
    if (req.query.teacher_id) where.teacher_id = req.query.teacher_id;
    if (req.query.is_active !== undefined) where.is_active = req.query.is_active === "true";
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
      const date = String(req.query.date);
      where.start_time = {
        [Op.between]: [new Date(`${date}T00:00:00.000Z`), new Date(`${date}T23:59:59.999Z`)],
      };
    }
    if (req.user?.role === "teacher") {
      const teacherProfile = await Teacher.findOne({ where: { user_id: req.user.id }, attributes: ["id"] });
      if (!teacherProfile) {
        return res.status(403).json({ success: false, message: "Teacher profile not found for this user." });
      }
      where.teacher_id = teacherProfile.id;
    }

    const include = req.query.full === "1" ? examDetailIncludes : examListIncludes;

    const result = await Exam.findAndCountAll({
      where,
      include,
      distinct: true,
      limit,
      offset,
      order: req.query.date ? [["start_time", "ASC"]] : [["created_at", "DESC"]],
    });
    return res.json({
      success: true,
      data: result.rows,
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit) || 1,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExam = async (req, res) => {
  try {
    const row = await Exam.findByPk(req.params.id, { include: examDetailIncludes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExam = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const body = { ...req.body };
    const title = String(body.title || body.name || "").trim();
    if (!title) throw new Error("Exam name is required.");
    const examType = String(body.exam_type || "questions").trim() === EXAM_PDF_FORM_TYPE ? EXAM_PDF_FORM_TYPE : "questions";
    const isPdfForm = examType === EXAM_PDF_FORM_TYPE;
    if (!isPdfForm && !body.template_id) throw new Error("Template is required.");
    if (!Number.isFinite(Number(body.duration_minutes)) || Number(body.duration_minutes) <= 0) {
      throw new Error("Duration minutes must be greater than zero.");
    }

    let template = null;
    if (body.template_id) {
      template = await ExamTemplate.findByPk(body.template_id, { transaction: tx });
      if (!template) throw new Error("Selected template was not found.");
    }

    const normalizedQuestions = Array.isArray(body.questions) ? body.questions.map((q, i) => normalizeQuestion(q, i)) : [];
    if (!isPdfForm && !normalizedQuestions.length) throw new Error("At least one exam question is required.");
    const status = body.status && EXAM_STATUS.has(String(body.status)) ? String(body.status) : "draft";
    const assignedStudentIds = await validateAndNormalizeAssignedStudentIds(body.assigned_student_ids, {
      curriculum_class_id: body.curriculum_class_id,
      curriculum_class_level_id: body.curriculum_class_level_id,
    });

    const createPayload = {
      title,
      description: body.description || null,
      exam_type: examType,
      template_id: body.template_id || null,
      pdf_answer_key_json:
        body.pdf_answer_key_json && typeof body.pdf_answer_key_json === "object" ? body.pdf_answer_key_json : {},
      curriculum_id: body.curriculum_id || null,
      curriculum_class_id: body.curriculum_class_id || null,
      curriculum_subject_id: body.curriculum_subject_id || null,
      curriculum_class_level_id: body.curriculum_class_level_id || null,
      total_marks: Number.isFinite(Number(body.total_marks)) ? Number(body.total_marks) : 0,
      passing_marks: Number.isFinite(Number(body.passing_marks)) ? Number(body.passing_marks) : 0,
      duration_minutes: Number(body.duration_minutes),
      requires_webcam: Boolean(body.requires_webcam),
      prevent_tab_switch: body.prevent_tab_switch === undefined ? true : Boolean(body.prevent_tab_switch),
      instructions: body.instructions || null,
      exam_layout_json: normalizeExamLayout(body.exam_layout_json),
      status,
      assigned_student_ids: assignedStudentIds,
    };
    applySchedulingFields(body, createPayload, true, req.user?.id || body.created_by || null);
    applyProctoringToPayload(
      { ...body, proctoring_mode: body.proctoring_mode || createPayload.proctoring_mode || "record_only" },
      createPayload
    );
    const row = await Exam.create(createPayload, { transaction: tx });
    const meetingPatch = meetingFieldsForProctoringMode(row, row.proctoring_mode);
    if (Object.keys(meetingPatch).length) {
      await row.update(meetingPatch, { transaction: tx });
    }
    if (normalizedQuestions.length) {
      await ExamQuestion.bulkCreate(
        normalizedQuestions.map((q) => ({ ...q, exam_id: row.id })),
        { transaction: tx }
      );
    }
    await tx.commit();
    const created = await Exam.findByPk(row.id, { include: examDetailIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const row = await Exam.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam not found" });
    }
    const allowed = [
      "title",
      "description",
      "template_id",
      "curriculum_id",
      "curriculum_class_id",
      "curriculum_subject_id",
      "curriculum_class_level_id",
      "total_marks",
      "passing_marks",
      "duration_minutes",
      "requires_webcam",
      "prevent_tab_switch",
      "instructions",
      "exam_layout_json",
      "status",
      "created_by",
      "teacher_id",
      "start_time",
      "end_time",
      "timezone",
      "session_status",
      "is_active",
      "proctoring_mode",
      "proctoring_rules_json",
      "meeting_provider",
      "meeting_id",
      "meeting_join_url",
      "meeting_host_url",
      "exam_type",
      "pdf_answer_key_json",
      "assigned_student_ids",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.exam_layout_json !== undefined) {
      patch.exam_layout_json = normalizeExamLayout(patch.exam_layout_json);
    }
    if (patch.session_status !== undefined) {
      const ss = String(patch.session_status || "").trim();
      if (ss === "" || ss === "null") patch.session_status = null;
      else if (!SESSION_STATUS.has(ss)) delete patch.session_status;
    }
    patch.updated_by = req.user?.id || null;
    if (req.body.proctoring_mode !== undefined) {
      applyProctoringToPayload(req.body, patch);
    }
    const nextMode = patch.proctoring_mode ?? row.proctoring_mode;
    Object.assign(patch, meetingFieldsForProctoringMode(row, nextMode));
    if (req.body.assigned_student_ids !== undefined) {
      const classId = patch.curriculum_class_id ?? row.curriculum_class_id;
      const levelId = patch.curriculum_class_level_id ?? row.curriculum_class_level_id;
      patch.assigned_student_ids = await validateAndNormalizeAssignedStudentIds(req.body.assigned_student_ids, {
        curriculum_class_id: classId,
        curriculum_class_level_id: levelId,
      });
    }
    const scheduleTimezone = patch.timezone ?? row.timezone ?? "Africa/Nairobi";
    if (patch.start_time !== undefined) {
      patch.start_time = normalizeWallClockToDate(patch.start_time, scheduleTimezone);
    }
    if (patch.end_time !== undefined) {
      patch.end_time = normalizeWallClockToDate(patch.end_time, scheduleTimezone);
    }
    await row.update(patch);
    if (Array.isArray(req.body.questions)) {
      const tx = await sequelize.transaction();
      try {
        await syncExamQuestions(row.id, req.body.questions, tx);
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      }
    }
    const updated = await Exam.findByPk(row.id, { include: examDetailIncludes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const row = await Exam.findByPk(req.params.id, { transaction: tx });
    if (!row) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    // Delete exam-linked rows in FK-safe order.
    const questions = await ExamQuestion.findAll({
      where: { exam_id: row.id },
      attributes: ["id"],
      transaction: tx,
    });
    const questionIds = questions.map((q) => q.id);

    const attempts = await ExamAttempt.findAll({
      where: { exam_id: row.id },
      attributes: ["id"],
      transaction: tx,
    });
    const attemptIds = attempts.map((a) => a.id);

    const submissions = await ExamSubmission.findAll({
      where: { exam_id: row.id },
      attributes: ["id"],
      transaction: tx,
    });
    const submissionIds = submissions.map((s) => s.id);

    if (questionIds.length) {
      await ExamAnswer.destroy({ where: { question_id: questionIds }, transaction: tx });
      await ExamSessionLog.destroy({ where: { question_id: questionIds }, transaction: tx });
    }

    if (submissionIds.length) {
      await ExamAnswer.destroy({ where: { submission_id: submissionIds }, transaction: tx });
      await ExamSubmission.destroy({ where: { id: submissionIds }, transaction: tx });
    }

    if (attemptIds.length) {
      const attempts = await ExamAttempt.findAll({ where: { id: attemptIds }, attributes: ['exam_id'], transaction: tx });
      const examIds = attempts.map(a => a.exam_id);
      await StudentExamResult.destroy({ where: { exam_id: { [Op.in]: examIds } }, transaction: tx });
      await ExamSessionLog.destroy({ where: { exam_attempt_id: attemptIds }, transaction: tx });
      await ExamAttempt.destroy({ where: { id: attemptIds }, transaction: tx });
    }

    await ExamQuestion.destroy({ where: { exam_id: row.id }, transaction: tx });
    await row.destroy({ transaction: tx });
    await tx.commit();
    return res.json({ success: true, message: "Exam deleted" });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.duplicateExam = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const source = await Exam.findByPk(req.params.id, {
      include: [{ model: ExamQuestion, as: "questions" }],
      transaction: tx,
    });
    if (!source) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const titleSuffix = String(body.title_suffix || " (Copy)");
    const nextTitle = `${String(source.title || "Exam").trim()}${titleSuffix}`.slice(0, 200).trim();
    const sourceQuestions = Array.isArray(source.questions) ? source.questions : [];
    if (!sourceQuestions.length) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: "Source exam has no questions to duplicate." });
    }

    const duplicated = await Exam.create(
      {
        title: nextTitle || "Exam (Copy)",
        description: source.description || null,
        template_id: source.template_id,
        total_marks: Number(source.total_marks || 0),
        passing_marks: Number(source.passing_marks || 0),
        duration_minutes: Number(source.duration_minutes || 60),
        requires_webcam: Boolean(source.requires_webcam),
        prevent_tab_switch: Boolean(source.prevent_tab_switch),
        instructions: source.instructions || null,
        exam_layout_json: normalizeExamLayout(source.exam_layout_json),
        status: "draft",
        assigned_student_ids: normalizeAssignedStudentIds(source.assigned_student_ids),
        curriculum_id: source.curriculum_id,
        curriculum_class_id: source.curriculum_class_id,
        curriculum_subject_id: source.curriculum_subject_id,
        curriculum_class_level_id: source.curriculum_class_level_id,
        created_by: req.user?.id || source.created_by || null,
      },
      { transaction: tx }
    );

    await ExamQuestion.bulkCreate(
      sourceQuestions.map((q, i) => {
        const normalized = normalizeQuestion(q?.toJSON ? q.toJSON() : q, i);
        return { ...normalized, exam_id: duplicated.id };
      }),
      { transaction: tx }
    );

    await tx.commit();
    const created = await Exam.findByPk(duplicated.id, { include: examDetailIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.createExamSubmission = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id, { include: [{ model: ExamQuestion, as: "questions" }] });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    if (isPdfFormExam(exam) && !exam.pdf_template_path) {
      return res.status(400).json({ success: false, message: "PDF exam template has not been uploaded yet." });
    }
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });
    if (!isStudentAssignedToExam(exam, student.id)) {
      return res.status(403).json({ success: false, message: "You are not assigned to this exam." });
    }

    const inWindow = isWithinExamScheduleWindow(exam);
    if (isBeforeExamScheduleStart(exam)) {
      return res.status(403).json({ success: false, message: "This exam has not started yet." });
    }

    let submission = await ExamSubmission.findOne({
      where: { exam_id: exam.id, student_id: student.id, status: "draft" },
      include: [{ model: ExamAnswer, as: "answers" }],
      order: [["created_at", "DESC"]],
    });
    if (!submission && inWindow) {
      submission = await ExamSubmission.create({
        exam_id: exam.id,
        student_id: student.id,
        status: "draft",
        started_at: new Date(),
      });
      submission = await ExamSubmission.findByPk(submission.id, { include: [{ model: ExamAnswer, as: "answers" }] });
    } else if (!submission) {
      const submittedCount = await ExamSubmission.count({
        where: { exam_id: exam.id, student_id: student.id, status: "submitted" },
      });
      if (submittedCount >= 1) {
        return res.status(409).json({ success: false, message: "Exam already submitted. Re-opening is not allowed." });
      }
      submission = await ExamSubmission.create({
        exam_id: exam.id,
        student_id: student.id,
        status: "draft",
        started_at: new Date(),
      });
      submission = await ExamSubmission.findByPk(submission.id, { include: [{ model: ExamAnswer, as: "answers" }] });
    } else {
      submission = await autoSubmitElapsedDraftIfNeeded(submission, exam, student.id);
      submission = await ExamSubmission.findByPk(submission.id, { include: [{ model: ExamAnswer, as: "answers" }] });
      if (submission?.status === "submitted") {
        return res.status(409).json({
          success: false,
          message: "Your exam time has ended. Your saved answers were submitted automatically.",
          code: "duration_elapsed_submitted",
        });
      }
    }
    await ensureExamAttemptForProctoring(exam, student.id, submission);
    return res.status(201).json({ success: true, data: submission });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMyExamSubmission = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    if (!isStudentAssignedToExam(exam, student.id)) {
      return res.status(403).json({ success: false, message: "You are not assigned to this exam." });
    }

    const submissions = await ExamSubmission.findAll({
      where: { exam_id: req.params.id, student_id: student.id },
      include: [
        { model: ExamAnswer, as: "answers", include: [{ model: ExamQuestion, as: "question" }] },
        { model: Exam, as: "exam", include: examDetailIncludes },
      ],
      order: [["created_at", "DESC"], [{ model: ExamAnswer, as: "answers" }, "created_at", "ASC"]],
    });
    let submission = pickStudentExamSubmission(submissions);
    if (submission?.status === "draft") {
      submission = await autoSubmitElapsedDraftIfNeeded(submission, exam, student.id);
      const refreshed = await ExamSubmission.findAll({
        where: { exam_id: req.params.id, student_id: student.id },
        include: [
          { model: ExamAnswer, as: "answers", include: [{ model: ExamQuestion, as: "question" }] },
          { model: Exam, as: "exam", include: examDetailIncludes },
        ],
        order: [["created_at", "DESC"], [{ model: ExamAnswer, as: "answers" }, "created_at", "ASC"]],
      });
      submission = pickStudentExamSubmission(refreshed);
    }
    const access = buildStudentExamAccess(exam, submission, exam);
    return res.json({
      success: true,
      data: submission,
      access,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveSubmissionAnswers = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) throw new Error("Student profile not found for this user.");
    const submission = await ExamSubmission.findByPk(req.params.submissionId, { transaction: tx });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    if (submission.student_id !== student.id) return res.status(403).json({ success: false, message: "You cannot edit this submission." });
    if (submission.status !== "draft") throw new Error("Submission already submitted.");

    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    for (const item of answers) {
      if (!item?.question_id) continue;
      const existing = await ExamAnswer.findOne({
        where: { submission_id: submission.id, question_id: item.question_id },
        include: [{ model: ExamQuestion, as: "question", attributes: ["id", "question_type"] }],
        transaction: tx,
      });
      const isFileUpload = existing?.question?.question_type === "file_upload";
      const incomingJson = item.answer_json !== undefined ? item.answer_json : null;
      const incomingHasFiles =
        incomingJson &&
        typeof incomingJson === "object" &&
        Array.isArray(incomingJson.files) &&
        incomingJson.files.length > 0;
      const existingHasFiles =
        existing?.answer_json &&
        typeof existing.answer_json === "object" &&
        Array.isArray(existing.answer_json.files) &&
        existing.answer_json.files.length > 0;

      let answer_json = incomingJson;
      if (isFileUpload && !incomingHasFiles && existingHasFiles) {
        answer_json = existing.answer_json;
      }

      const payload = {
        answer_text: item.answer_text != null ? String(item.answer_text) : null,
        answer_json,
      };
      if (existing) await existing.update(payload, { transaction: tx });
      else await ExamAnswer.create({ submission_id: submission.id, question_id: item.question_id, ...payload }, { transaction: tx });
    }
    await tx.commit();
    const updated = await ExamSubmission.findByPk(submission.id, { include: [{ model: ExamAnswer, as: "answers" }] });
    return res.json({ success: true, data: updated });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

const rejectUploadedFile = async (req, res, status, message) => {
  if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
  return res.status(status).json({ success: false, message });
};

/** Upload a file for a file_upload question (works alongside strict proctoring). */
exports.uploadSubmissionAnswerFile = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const submission = await ExamSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Exam, as: "exam" }],
    });
    if (!submission) return rejectUploadedFile(req, res, 404, "Submission not found");
    if (submission.student_id !== student.id) {
      return rejectUploadedFile(req, res, 403, "You cannot edit this submission.");
    }
    if (submission.status !== "draft") {
      return rejectUploadedFile(req, res, 400, "Submission already submitted.");
    }

    const questionId = req.params.questionId;
    const question = await ExamQuestion.findOne({
      where: { id: questionId, exam_id: submission.exam_id },
    });
    if (!question) return rejectUploadedFile(req, res, 404, "Question not found on this exam.");
    if (question.question_type !== "file_upload") {
      return rejectUploadedFile(req, res, 400, "This question does not accept file uploads.");
    }

    const opts = question.options && typeof question.options === "object" ? question.options : {};
    const accept = Array.isArray(opts.accept) ? opts.accept : ["image/*", "application/pdf"];
    const maxFiles = Math.min(5, Math.max(1, Number(opts.max_files) || 1));
    const maxSizeMb = Math.min(25, Math.max(1, Number(opts.max_size_mb) || 10));

    if (!mimeMatchesAccept(req.file.mimetype, accept)) {
      return rejectUploadedFile(
        req,
        res,
        400,
        `File type not allowed. Accepted: ${accept.join(", ")}`
      );
    }
    if (req.file.size > maxSizeMb * 1024 * 1024) {
      return rejectUploadedFile(req, res, 400, `File exceeds maximum size of ${maxSizeMb} MB.`);
    }

    const relPath = convertToRelativePath(req.file.path);
    const fileEntry = {
      url: relPath,
      name: req.file.originalname || path.basename(req.file.path),
      mime: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date().toISOString(),
    };

    let answer = await ExamAnswer.findOne({
      where: { submission_id: submission.id, question_id: questionId },
    });
    const prevJson =
      answer?.answer_json && typeof answer.answer_json === "object" && !Array.isArray(answer.answer_json)
        ? answer.answer_json
        : {};
    const prevFiles = Array.isArray(prevJson.files) ? prevJson.files : [];
    if (prevFiles.length >= maxFiles) {
      return rejectUploadedFile(req, res, 400, `Maximum ${maxFiles} file(s) allowed for this question.`);
    }
    const nextJson = { ...prevJson, files: [...prevFiles, fileEntry] };

    if (answer) {
      await answer.update({ answer_json: nextJson, answer_text: null });
    } else {
      answer = await ExamAnswer.create({
        submission_id: submission.id,
        question_id: questionId,
        answer_json: nextJson,
        answer_text: null,
      });
    }

    return res.json({ success: true, data: answer });
  } catch (error) {
    if (req.file?.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.submitExamSubmission = async (req, res) => {
  try {
    const student = await findStudentByUser(req.user?.id);
    if (!student) return res.status(403).json({ success: false, message: "Student profile not found for this user." });
    const submission = await ExamSubmission.findByPk(req.params.submissionId, {
      include: [{ model: Exam, as: "exam", include: [{ model: ExamQuestion, as: "questions" }] }, { model: ExamAnswer, as: "answers" }],
    });
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });
    if (submission.student_id !== student.id) return res.status(403).json({ success: false, message: "You cannot submit this submission." });
    if (submission.status === "submitted") return res.json({ success: true, data: submission });

    const submitReason = String(req.body?.submit_reason || "manual_submit");
    const autoSubmitNoAnswerAllowed = new Set([
      "auto_submit_tab_switch",
      "auto_submit_warning_limit",
      "auto_submit_time_elapsed",
    ]).has(submitReason);
    const pdfForm = isPdfFormExam(submission.exam);
    if (pdfForm) {
      const answers =
        submission.pdf_answers_json && typeof submission.pdf_answers_json === "object" ? submission.pdf_answers_json : {};
      const hasAny = hasManualPdfSubmissionContent(answers);
      if (!hasAny && !autoSubmitNoAnswerAllowed) {
        return res.status(400).json({
          success: false,
          message: "Add at least one typed answer or upload your working paper before submitting.",
        });
      }
    } else {
      const requiredQuestions = (submission.exam?.questions || []).filter((q) => q.required);
      const answerMap = new Map((submission.answers || []).map((a) => [a.question_id, a]));
      const hasAnyAnsweredQuestion = (submission.answers || []).some((a) => hasMeaningfulAnswer(a));
      if (!hasAnyAnsweredQuestion && !autoSubmitNoAnswerAllowed) {
        return res.status(400).json({ success: false, message: "You must answer at least one question before submitting." });
      }
      if (!autoSubmitNoAnswerAllowed) {
        for (const rq of requiredQuestions) {
          const ans = answerMap.get(rq.id);
          if (!hasMeaningfulAnswer(ans)) {
            return res.status(400).json({ success: false, message: `Required question not answered: ${rq.question_text}` });
          }
        }
      }
    }

    const startedAt = submission.started_at ? new Date(submission.started_at).getTime() : Date.now();
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const limitSeconds = Number(submission.exam?.duration_minutes || 0) * 60;
    const isTimeAutoSubmit = submitReason === "auto_submit_time_elapsed";
    if (limitSeconds > 0 && elapsed > limitSeconds && !isTimeAutoSubmit) {
      return res.status(400).json({ success: false, message: "Exam time has elapsed." });
    }

    const submittedAt = new Date();
    if (pdfForm) {
      await finalizePdfFormSubmission(submission, submission.exam);
      await submission.reload();
    }
    await submission.update({ status: "submitted", submitted_at: submittedAt, time_spent_seconds: elapsed });
    await syncProctoringAttemptWithSubmission(submission.exam, student.id, submission, {
      submitReason,
    });
    const updated = await ExamSubmission.findByPk(submission.id, { include: [{ model: ExamAnswer, as: "answers" }] });
    return res.json({
      success: true,
      data: updated,
      pdf_grading: pdfForm ? updated.pdf_auto_grading_json : undefined,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listExamSubmissionsForMarking = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id, {
      include: [{ model: ExamQuestion, as: "questions", attributes: ["id", "question_text", "marks", "required", "order_number"] }],
    });
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    if (usesActivityMonitor(exam.proctoring_mode)) {
      await markActivityExamInvigilatorPresent(exam, {
        userId: req.user?.id || null,
        source: "submissions_marking",
      });
    }

    const where = { exam_id: exam.id };
    if (req.query.status && ["draft", "submitted"].includes(String(req.query.status))) where.status = String(req.query.status);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { rows: submissions, count } = await ExamSubmission.findAndCountAll({
      where,
      distinct: true,
      limit,
      offset,
      include: [
        {
          model: Student,
          as: "student",
          attributes: ["id", "admission_number", "user_id"],
          include: [{ model: User, as: "user", ...userSafe }],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const total = typeof count === "number" ? count : count?.length || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const studentIds = submissions.map((s) => s.student_id).filter(Boolean);
    const attempts = studentIds.length
      ? await ExamAttempt.findAll({
          where: { exam_id: exam.id, student_id: { [Op.in]: studentIds } },
          attributes: ["id", "student_id", "total_score", "percentage", "is_passed", "status", "updated_at"],
          order: [["updated_at", "DESC"]],
        })
      : [];
    const attemptByStudent = new Map();
    for (const a of attempts) {
      if (!attemptByStudent.has(a.student_id)) attemptByStudent.set(a.student_id, a);
    }

    const results = studentIds.length
      ? await StudentExamResult.findAll({
          where: { exam_id: exam.id, student_id: { [Op.in]: studentIds } },
          attributes: ["id", "student_id", "grade", "grade_letter", "grade_remarks", "points", "updated_at"],
        })
      : [];
    const resultByStudent = new Map();
    for (const r of results) {
      if (!resultByStudent.has(r.student_id)) resultByStudent.set(r.student_id, r);
    }

    const rows = await Promise.all(submissions.map(async (s) => {
      const attempt = attemptByStudent.get(s.student_id) || null;
      const answers = await ExamAnswer.findAll({
        where: { submission_id: s.id },
        include: [{ model: ExamQuestion, as: "question", attributes: ["id", "question_text", "marks", "order_number"] }],
        order: [[{ model: ExamQuestion, as: "question" }, "order_number", "ASC"]],
      });
      const uniqueAnswers = answers.filter((a, index, arr) => arr.findIndex(b => b.question_id === a.question_id) === index);
      return {
        id: s.id,
        status: s.status,
        started_at: s.started_at,
        submitted_at: s.submitted_at,
        created_at: s.created_at,
        pdf_answers_json: s.pdf_answers_json,
        pdf_completed_file_path: s.pdf_completed_file_path,
        pdf_auto_score: s.pdf_auto_score != null ? Number(s.pdf_auto_score) : null,
        pdf_auto_grading_json: s.pdf_auto_grading_json,
        student: s.student || null,
        answers: uniqueAnswers.map((a) => ({
          id: a.id,
          question_id: a.question_id,
          question_text: a.question?.question_text || "Question",
          question_marks: Number(a.question?.marks || 0),
          marks_obtained: a.marks_obtained != null ? Number(a.marks_obtained) : null,
          marker_comment: a.marker_comment || null,
          answer_text: a.answer_text,
          answer_json: a.answer_json,
          order_number: Number(a.question?.order_number || 0),
        })),
        marking: attempt
          ? {
              total_score: attempt.total_score,
              percentage: attempt.percentage,
              is_passed: attempt.is_passed,
              status: attempt.status,
              updated_at: attempt.updated_at,
              grade: resultByStudent.get(s.student_id)?.grade || null,
              grade_letter: resultByStudent.get(s.student_id)?.grade_letter || null,
              grade_remarks: resultByStudent.get(s.student_id)?.grade_remarks || null,
              points: resultByStudent.get(s.student_id)?.points || null,
            }
          : null,
      };
    }));

    return res.json({
      success: true,
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          exam_type: exam.exam_type,
          total_marks: exam.total_marks,
          passing_marks: exam.passing_marks,
        },
        submissions: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markExamSubmission = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    if (submission.status !== "submitted") {
      return res.status(400).json({ success: false, message: "Only submitted exams can be marked." });
    }



    const score = Number(req.body?.total_score);
    if (!Number.isFinite(score) || score < 0) {
      return res.status(400).json({ success: false, message: "total_score must be a valid non-negative number." });
    }
    const totalMarks = Math.max(0, Number(exam.total_marks || 0));
    if (totalMarks > 0 && score > totalMarks) {
      return res.status(400).json({ success: false, message: `total_score cannot exceed total_marks (${totalMarks}).` });
    }
    const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(2)) : 0;
    const passMark = Number(exam.passing_marks || 0);
    const isPassed = score >= passMark;

    let attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });
    if (!attempt) {
      attempt = await ExamAttempt.create({
        exam_id: exam.id,
        student_id: submission.student_id,
        status: "completed",
        start_time: submission.started_at || submission.created_at || new Date(),
        end_time: submission.submitted_at || new Date(),
        submitted_at: submission.submitted_at || new Date(),
      });
    }
    await attempt.update({
      total_score: score,
      percentage,
      is_passed: isPassed,
      status: "completed",
      submitted_at: submission.submitted_at || new Date(),
      end_time: submission.submitted_at || new Date(),
    });
    await attempt.reload();

    return res.json({
      success: true,
      data: {
        submission_id: submission.id,
        total_score: Number(attempt.total_score),
        percentage: attempt.percentage,
        is_passed: attempt.is_passed,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.markExamAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const answer = await ExamAnswer.findByPk(req.params.answerId, {
      include: [{ model: ExamQuestion, as: "question", attributes: ["id", "marks"] }],
    });
    if (!answer || answer.submission_id !== submission.id) {
      return res.status(404).json({ success: false, message: "Answer not found for this submission" });
    }

    const payload = {};
    const hasMarks = req.body?.marks_obtained !== undefined && req.body?.marks_obtained !== null && req.body?.marks_obtained !== "";
    if (hasMarks) {
      const marksObtained = Number(req.body.marks_obtained);
      if (!Number.isFinite(marksObtained) || marksObtained < 0) {
        return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
      }
      const questionMarks = Number(answer.question?.marks || 0);
      if (questionMarks > 0 && marksObtained > questionMarks) {
        return res.status(400).json({ success: false, message: `marks_obtained cannot exceed question marks (${questionMarks}).` });
      }
      payload.marks_obtained = marksObtained;
    }
    if (req.body?.marker_comment !== undefined) {
      const raw = req.body.marker_comment;
      payload.marker_comment = raw == null || String(raw).trim() === "" ? null : String(raw).trim().slice(0, 2000);
    }
    if (!Object.keys(payload).length) {
      return res.status(400).json({ success: false, message: "Provide marks_obtained and/or marker_comment." });
    }

    await answer.update(payload);

    return res.json({
      success: true,
      data: {
        answer_id: answer.id,
        marks_obtained: answer.marks_obtained,
        marker_comment: answer.marker_comment,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.markPdfManualAnswer = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    if (submission.status !== "submitted") {
      return res.status(400).json({ success: false, message: "Only submitted exams can be marked." });
    }
    if (!submissionHasManualPdfEntries(submission)) {
      return res.status(400).json({ success: false, message: "This submission has no manual PDF answer entries." });
    }

    const entryId = String(req.params.entryId || "");
    const raw = submission.pdf_answers_json && typeof submission.pdf_answers_json === "object"
      ? submission.pdf_answers_json
      : {};
    const entries = Array.isArray(raw.entries) ? [...raw.entries] : [];
    const index = entries.findIndex((entry) => String(entry?.id) === entryId);
    if (index < 0) {
      return res.status(404).json({ success: false, message: "PDF answer entry not found." });
    }

    const entry = { ...entries[index] };
    const hasMarks =
      req.body?.marks_obtained !== undefined && req.body?.marks_obtained !== null && req.body?.marks_obtained !== "";
    if (hasMarks) {
      const marksObtained = Number(req.body.marks_obtained);
      if (!Number.isFinite(marksObtained) || marksObtained < 0) {
        return res.status(400).json({ success: false, message: "marks_obtained must be a valid non-negative number." });
      }
      entry.marks_obtained = marksObtained;
    }
    if (req.body?.marker_comment !== undefined) {
      const rawComment = req.body.marker_comment;
      entry.marker_comment =
        rawComment == null || String(rawComment).trim() === "" ? null : String(rawComment).trim().slice(0, 2000);
    }
    if (!hasMarks && req.body?.marker_comment === undefined) {
      return res.status(400).json({ success: false, message: "Provide marks_obtained and/or marker_comment." });
    }

    entries[index] = entry;
    await submission.update({
      pdf_answers_json: {
        ...raw,
        mode: raw.mode || "manual",
        entries,
        working_papers: Array.isArray(raw.working_papers) ? raw.working_papers : [],
      },
    });

    return res.json({
      success: true,
      data: {
        entry_id: entryId,
        marks_obtained: entry.marks_obtained != null ? Number(entry.marks_obtained) : null,
        marker_comment: entry.marker_comment || null,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.cleanupExamStaleDraftSubmissions = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const exam = await Exam.findByPk(req.params.id, { transaction: tx });
    if (!exam) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Exam not found" });
    }

    const submittedRows = await ExamSubmission.findAll({
      where: { exam_id: exam.id, status: "submitted" },
      attributes: ["student_id"],
      transaction: tx,
    });
    const studentIds = [...new Set(submittedRows.map((r) => r.student_id).filter(Boolean))];
    if (!studentIds.length) {
      await tx.commit();
      return res.json({
        success: true,
        data: { exam_id: exam.id, draft_submissions_deleted: 0, draft_answers_deleted: 0 },
      });
    }

    const staleDrafts = await ExamSubmission.findAll({
      where: { exam_id: exam.id, status: "draft", student_id: { [Op.in]: studentIds } },
      attributes: ["id"],
      transaction: tx,
    });
    const staleDraftIds = staleDrafts.map((d) => d.id);
    if (!staleDraftIds.length) {
      await tx.commit();
      return res.json({
        success: true,
        data: { exam_id: exam.id, draft_submissions_deleted: 0, draft_answers_deleted: 0 },
      });
    }

    const draftAnswersDeleted = await ExamAnswer.destroy({
      where: { submission_id: { [Op.in]: staleDraftIds } },
      transaction: tx,
    });
    const draftSubmissionsDeleted = await ExamSubmission.destroy({
      where: { id: { [Op.in]: staleDraftIds } },
      transaction: tx,
    });

    await tx.commit();
    return res.json({
      success: true,
      data: {
        exam_id: exam.id,
        draft_submissions_deleted: draftSubmissionsDeleted,
        draft_answers_deleted: draftAnswersDeleted,
      },
    });
  } catch (error) {
    await tx.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};
