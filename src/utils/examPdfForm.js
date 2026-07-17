const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { parsePdfBuffer } = require("./pdfParseBuffer");
const PDFDocumentKit = require("pdfkit");

const EXAM_PDF_FORM_TYPE = "pdf_form";
const PDF_SOURCE_ACROFORM = "acroform";
const PDF_SOURCE_FLAT = "flat";
const PDF_SOURCE_MANUAL = "manual";

function isPdfFormExam(exam) {
  return String(exam?.exam_type || "").trim() === EXAM_PDF_FORM_TYPE;
}

function fieldTypeLabel(field) {
  const name = field?.constructor?.name || "";
  return name.replace(/^PDF/, "").replace(/Field$/, "") || "Unknown";
}

function readFieldValue(field) {
  const type = fieldTypeLabel(field);
  try {
    if (type === "Text") return field.getText() ?? "";
    if (type === "CheckBox") return field.isChecked();
    if (type === "RadioGroup") return field.getSelected() ?? "";
    if (type === "Dropdown") return field.getSelected() ?? "";
    if (type === "OptionList") {
      const selected = field.getSelected();
      return Array.isArray(selected) ? selected : selected ?? [];
    }
  } catch {
    return null;
  }
  return null;
}

function writeFieldValue(field, value) {
  const type = fieldTypeLabel(field);
  if (type === "Text") {
    field.setText(value == null ? "" : String(value));
    return;
  }
  if (type === "CheckBox") {
    const on = value === true || value === "true" || value === "yes" || value === "1" || value === 1;
    if (on) field.check();
    else field.uncheck();
    return;
  }
  if (type === "RadioGroup" || type === "Dropdown") {
    if (value != null && String(value).trim() !== "") field.select(String(value));
    return;
  }
  if (type === "OptionList" && Array.isArray(value)) {
    field.select(value.map((v) => String(v)));
  }
}

/** Word / Print-to-PDF: no AcroForm — infer answer fields from question text (Q1, Q2, …). */
function inferAnswerFieldsFromPdfText(rawText) {
  const text = String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/\uF0B7/g, "")
    .replace(/[•●▪]/g, "")
    .trim();
  const schema = [];

  if (/student\s+details/i.test(text) || /Name:\s*\[/i.test(text)) {
    schema.push({ name: "student_name", type: "Text", label: "Student name", source: PDF_SOURCE_FLAT });
    schema.push({ name: "exam_date", type: "Text", label: "Date", source: PDF_SOURCE_FLAT });
    schema.push({ name: "student_class", type: "Text", label: "Class", source: PDF_SOURCE_FLAT });
  }

  const blocks = text.split(/(?=\bQ\s*\d+\s*[\.\):])/i).filter((b) => b.trim());
  for (const block of blocks) {
    const m = block.match(/^\s*Q\s*(\d+)\s*[\.\):]\s*([\s\S]*)/i);
    if (!m) continue;
    const num = m[1];
    const body = m[2].trim();
    const key = `q${num}`;
    const firstLine = body.split("\n").find((l) => l.trim()) || body;
    const prompt = firstLine.slice(0, 280);

    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    const options = [];
    for (const line of lines) {
      if (/^[☐□◻✓✔]\s*/.test(line) || /^\[\s*\]/.test(line)) {
        const opt = line
          .replace(/^[☐□◻✓✔\s\[\]-]+/, "")
          .replace(/^\s*[-•]\s*/, "")
          .trim();
        if (opt && opt.length < 160 && !/^Q\s*\d+/i.test(opt)) options.push(opt);
      }
    }

    const isMcq =
      options.length >= 2 ||
      /\btick\b/i.test(body) ||
      /multiple\s+choice/i.test(text.slice(0, Math.max(0, text.indexOf(block))));
    const isLong =
      /show\s+your\s+working/i.test(body) ||
      /^Working:/im.test(body) ||
      (/Answer:/i.test(body) && body.length > 120);

    if (isMcq && options.length >= 2) {
      schema.push({
        name: key,
        type: "RadioGroup",
        label: `Q${num}`,
        prompt,
        options,
        source: PDF_SOURCE_FLAT,
      });
    } else if (isLong) {
      schema.push({
        name: key,
        type: "long_text",
        label: `Q${num}`,
        prompt,
        source: PDF_SOURCE_FLAT,
      });
    } else {
      schema.push({
        name: key,
        type: "Text",
        label: `Q${num}`,
        prompt,
        source: PDF_SOURCE_FLAT,
      });
    }
  }

  const questionFields = schema.filter((f) => /^q\d+$/i.test(f.name));
  if (!questionFields.length) {
    const qMatches = [...text.matchAll(/\bQ\s*(\d+)\s*[\.\):]/gi)];
    const maxQ = qMatches.length
      ? Math.max(...qMatches.map((x) => Number(x[1])).filter((n) => Number.isFinite(n)))
      : 0;
    const count = maxQ > 0 ? maxQ : 10;
    for (let i = 1; i <= count; i += 1) {
      schema.push({
        name: `q${i}`,
        type: "Text",
        label: `Question ${i}`,
        prompt: `Answer for question ${i} (see exam PDF)`,
        source: PDF_SOURCE_FLAT,
      });
    }
  }

  return {
    schema,
    fieldCount: schema.length,
    pdf_source_type: PDF_SOURCE_FLAT,
  };
}

async function extractPdfText(pdfBytes) {
  const parsed = await parsePdfBuffer(Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes));
  return String(parsed?.text || "").trim();
}

async function extractPdfFormSchema(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const schema = fields.map((field) => {
    const type = fieldTypeLabel(field);
    const entry = {
      name: field.getName(),
      type,
    };
    try {
      if (type === "RadioGroup" || type === "Dropdown") {
        entry.options = field.getOptions();
      }
    } catch {
      entry.options = [];
    }
    entry.source = PDF_SOURCE_ACROFORM;
    return entry;
  });
  return { schema, fieldCount: schema.length, pdf_source_type: PDF_SOURCE_ACROFORM };
}

/** Students type question numbers and answers manually — no auto Q1/Q2 fields. */
async function buildPdfExamSchema() {
  return {
    schema: [],
    fieldCount: 0,
    pdf_source_type: PDF_SOURCE_MANUAL,
  };
}

function formatLegacyAnswerValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "").trim();
}

const { normalizeWorkingPaper } = require("./pdfManualAnswers");

function normalizeManualPdfAnswers(raw) {
  if (!raw || typeof raw !== "object") {
    return { mode: PDF_SOURCE_MANUAL, entries: [], working_papers: [] };
  }
  const workingPapers = Array.isArray(raw.working_papers)
    ? raw.working_papers.map((file, index) => normalizeWorkingPaper(file, index))
    : [];
  if (Array.isArray(raw.entries)) {
    return {
      mode: PDF_SOURCE_MANUAL,
      entries: raw.entries.map((entry, index) => ({
        id: String(entry?.id || `entry-${index + 1}`),
        question: String(entry?.question ?? ""),
        answer: String(entry?.answer ?? ""),
      })),
      working_papers: workingPapers.filter((file) => file.url),
    };
  }
  const legacyEntries = Object.entries(raw)
    .filter(([key]) => !["mode", "entries", "working_papers"].includes(key))
    .map(([key, value], index) => ({
      id: `legacy-${index + 1}`,
      question: key.replace(/^q/i, "Q"),
      answer: formatLegacyAnswerValue(value),
    }))
    .filter((entry) => entry.answer);
  return { mode: PDF_SOURCE_MANUAL, entries: legacyEntries, working_papers: workingPapers.filter((file) => file.url) };
}

function hasManualPdfSubmissionContent(raw) {
  const normalized = normalizeManualPdfAnswers(raw);
  const hasEntries = normalized.entries.some((entry) => entry.question || entry.answer);
  const hasPapers = normalized.working_papers.length > 0;
  return hasEntries || hasPapers;
}

async function buildManualPdfAnswerSheet({ title, answers }) {
  const normalized = normalizeManualPdfAnswers(answers);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(title || "Exam — student answers", { underline: true });
    doc.moveDown();
    if (!normalized.entries.length && !normalized.working_papers.length) {
      doc.fontSize(11).text("No answers submitted.");
    } else {
      if (normalized.entries.length) {
        doc.fontSize(13).text("Typed answers", { underline: true });
        doc.moveDown(0.4);
        normalized.entries.forEach((entry) => {
          doc.fontSize(11).text(`Question ${entry.question || "—"}`, { continued: false });
          doc.fontSize(11).fillColor("#111").text(entry.answer || "—", { indent: 12 });
          doc.moveDown(0.6);
        });
      }
      if (normalized.working_papers.length) {
        doc.moveDown(0.4);
        doc.fontSize(13).text("Uploaded working papers", { underline: true });
        doc.moveDown(0.4);
        normalized.working_papers.forEach((file, index) => {
          doc.fontSize(11).text(`${index + 1}. ${file.name || "Uploaded file"} (${file.mime || "file"})`);
        });
      }
    }
    doc.end();
  });
}

function examPdfSourceType(exam) {
  const layout = exam?.exam_layout_json && typeof exam.exam_layout_json === "object" ? exam.exam_layout_json : {};
  if (layout.pdf_source_type) return layout.pdf_source_type;
  const schema = Array.isArray(exam?.pdf_field_schema_json) ? exam.pdf_field_schema_json : [];
  if (schema.some((f) => f?.source === PDF_SOURCE_ACROFORM)) return PDF_SOURCE_ACROFORM;
  if (schema.length > 0) return PDF_SOURCE_FLAT;
  return PDF_SOURCE_MANUAL;
}

function isManualPdfExam(exam) {
  return examPdfSourceType(exam) === PDF_SOURCE_MANUAL;
}

function isFlatPdfExam(exam) {
  return examPdfSourceType(exam) === PDF_SOURCE_FLAT;
}

async function extractPdfFormAnswers(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const answers = {};
  for (const field of form.getFields()) {
    answers[field.getName()] = readFieldValue(field);
  }
  return answers;
}

async function buildFlatPdfAnswerSheet({ title, schema, answers }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(title || "Exam — student answers", { underline: true });
    doc.moveDown();
    const fields = Array.isArray(schema) ? schema : [];
    for (const field of fields) {
      const val = answers?.[field.name];
      const label = field.label || field.name;
      const prompt = field.prompt ? `\n${field.prompt}` : "";
      let display = "";
      if (typeof val === "boolean") display = val ? "Yes" : "No";
      else if (Array.isArray(val)) display = val.join(", ");
      else display = String(val ?? "").trim() || "—";
      doc.fontSize(11).text(`${label}${prompt}`, { continued: false });
      doc.fontSize(11).fillColor("#111").text(display, { indent: 12 });
      doc.moveDown(0.6);
    }
    doc.end();
  });
}

async function fillPdfFromAnswers(templateBytes, answers) {
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const acroFields = form.getFields();
  if (!acroFields.length) {
    throw new Error("FLAT_PDF_NO_ACROFORM");
  }
  for (const field of acroFields) {
    const name = field.getName();
    if (!Object.prototype.hasOwnProperty.call(answers || {}, name)) continue;
    writeFieldValue(field, answers[name]);
  }
  try {
    form.updateFieldAppearances();
  } catch {
    // Some PDFs lack embedded fonts for appearances.
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function normalizeAnswerForCompare(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function gradePdfAnswers(answerKey, studentAnswers, totalMarks = 100) {
  const key = answerKey && typeof answerKey === "object" ? answerKey : {};
  const entries = Object.entries(key).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  if (!entries.length) {
    return { score: null, maxScore: null, percentage: null, breakdown: [] };
  }
  const perQuestion = entries.length ? Number(totalMarks) / entries.length : 0;
  let earned = 0;
  const breakdown = entries.map(([fieldName, correctAnswer]) => {
    const studentVal = studentAnswers?.[fieldName];
    const correct = normalizeAnswerForCompare(correctAnswer);
    const given = normalizeAnswerForCompare(studentVal);
    const match = correct === given;
    if (match) earned += perQuestion;
    return { fieldName, correctAnswer, studentAnswer: studentVal, match, marks: match ? perQuestion : 0 };
  });
  const maxScore = Number(totalMarks) || entries.length;
  const percentage = maxScore > 0 ? Math.round((earned / maxScore) * 10000) / 100 : 0;
  return { score: Math.round(earned * 100) / 100, maxScore, percentage, breakdown };
}

async function readFileBytes(relativeOrAbsolute) {
  const p = String(relativeOrAbsolute || "").trim();
  if (!p) throw new Error("PDF path is missing.");
  const abs = path.isAbsolute(p) ? p : path.join(__dirname, "..", "..", p.replace(/^\/+/, ""));
  return fs.promises.readFile(abs);
}

module.exports = {
  EXAM_PDF_FORM_TYPE,
  PDF_SOURCE_ACROFORM,
  PDF_SOURCE_FLAT,
  PDF_SOURCE_MANUAL,
  isPdfFormExam,
  isFlatPdfExam,
  isManualPdfExam,
  examPdfSourceType,
  normalizeManualPdfAnswers,
  hasManualPdfSubmissionContent,
  inferAnswerFieldsFromPdfText,
  extractPdfFormSchema,
  buildPdfExamSchema,
  extractPdfFormAnswers,
  fillPdfFromAnswers,
  buildFlatPdfAnswerSheet,
  buildManualPdfAnswerSheet,
  gradePdfAnswers,
  readFileBytes,
  readFieldValue,
  writeFieldValue,
};
