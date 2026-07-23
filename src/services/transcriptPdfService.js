/**
 * A4 academic transcript PDF — Maseno-style layout with KASMS branding.
 * Header contact + logo, student meta grid, unit table, recommendation,
 * grading legend, registrar signature block.
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  short: "KASMS",
  address: "Kendu, Kenya, 20-40301",
  phone: "+254 0711 954609",
  email: "kendunursing@yahoo.com",
  green: "#006050",
  navy: "#1e2858",
  gold: "#c8a840",
  ink: "#1a1a1a",
  muted: "#444444",
  line: "#333333",
};

const GRADING_LEGEND = [
  { range: "70%-100%", grade: "A", label: "EXCELLENT" },
  { range: "60%-69%", grade: "B", label: "VERY GOOD" },
  { range: "50%-59%", grade: "C", label: "GOOD" },
  { range: "40%-49%", grade: "D", label: "FAIR" },
  { range: "0%-39%", grade: "E", label: "FAIL" },
  { range: "#", grade: "", label: "AUDITED" },
];

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_public", "public", "images", "logo.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function safeText(value, maxLen = 200) {
  let s = String(value ?? "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.length > maxLen) return `${s.slice(0, maxLen - 3)}...`;
  return s;
}

function formatDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatPrintedDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function write(doc, text, x, y, opts = {}) {
  const {
    width,
    size = 9,
    color = BRAND.ink,
    bold = false,
    align = "left",
    height,
  } = opts;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
  doc.text(String(text ?? ""), x, y, {
    width,
    height,
    align,
    ellipsis: Boolean(height),
    lineBreak: Boolean(height && height > size + 4),
  });
}

function drawDashedLine(doc, x1, y, x2) {
  doc.save();
  doc.strokeColor(BRAND.line).lineWidth(0.6).dash(2.5, { space: 2 });
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.undash();
  doc.restore();
}

function metaRow(doc, label, value, x, y, labelW, valueW) {
  write(doc, `${label}:`, x, y, { size: 9, bold: true, width: labelW });
  write(doc, safeText(value, 90) || "—", x + labelW, y, { size: 9, width: valueW });
  return y + 14;
}

/**
 * @param {object} payload
 * @param {object} payload.student
 * @param {object} payload.programme
 * @param {object} payload.transcript
 * @param {Array} payload.lines
 */
async function buildTranscriptPdfBuffer(payload) {
  const { student, programme, transcript, lines = [] } = payload;
  const logoPath = resolveLogoPath();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 36, bottom: 40, left: 48, right: 48 },
    info: {
      Title: `Academic Transcript — ${student?.admission_number || student?.full_name || ""}`,
      Author: BRAND.short,
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  let y = doc.page.margins.top;

  // --- Contact strip ---
  write(doc, BRAND.address, left, y, { size: 8, color: BRAND.muted, width: width * 0.42 });
  write(doc, `Tel: ${BRAND.phone}`, left + width * 0.42, y, {
    size: 8,
    color: BRAND.muted,
    width: width * 0.58,
    align: "right",
  });
  y += 11;
  write(doc, `Email: ${BRAND.email}`, left + width * 0.42, y, {
    size: 8,
    color: BRAND.muted,
    width: width * 0.58,
    align: "right",
  });
  y += 18;

  // --- Logo + school name ---
  const logoSize = 62;
  const logoX = left + (width - logoSize) / 2;
  if (logoPath) {
    try {
      doc.image(logoPath, logoX, y, { width: logoSize, height: logoSize });
    } catch {
      /* ignore missing/corrupt logo */
    }
  } else {
    doc
      .circle(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2 - 2)
      .strokeColor(BRAND.green)
      .lineWidth(1.5)
      .stroke();
    write(doc, BRAND.short, logoX, y + logoSize / 2 - 6, {
      width: logoSize,
      size: 10,
      bold: true,
      color: BRAND.green,
      align: "center",
    });
  }
  y += logoSize + 10;

  write(doc, BRAND.name, left, y, {
    width,
    size: 16,
    bold: true,
    color: BRAND.navy,
    align: "center",
  });
  y += 22;
  write(doc, "ACADEMIC TRANSCRIPT", left, y, {
    width,
    size: 13,
    bold: true,
    color: BRAND.ink,
    align: "center",
  });
  y += 22;

  // --- Student meta (two columns) ---
  const colGap = 18;
  const colW = (width - colGap) / 2;
  const labelW = 108;
  const valueW = colW - labelW;
  const leftCol = left;
  const rightCol = left + colW + colGap;

  let yL = y;
  let yR = y;
  yL = metaRow(doc, "Admission No.", student?.admission_number, leftCol, yL, labelW, valueW);
  yR = metaRow(doc, "Name", student?.full_name, rightCol, yR, labelW, valueW);
  yL = metaRow(doc, "Year of Study", transcript?.year_of_study, leftCol, yL, labelW, valueW);
  yR = metaRow(doc, "Academic Year", transcript?.academic_year, rightCol, yR, labelW, valueW);
  yL = metaRow(
    doc,
    "School",
    transcript?.school_label || programme?.departments?.[0]?.name || "—",
    leftCol,
    yL,
    labelW,
    valueW
  );
  yR = metaRow(doc, "Program", programme?.name, rightCol, yR, labelW, valueW);
  yL = metaRow(
    doc,
    "Date of Admission",
    formatDateOnly(transcript?.date_of_admission),
    leftCol,
    yL,
    labelW,
    valueW
  );
  yR = metaRow(
    doc,
    "Date of Graduation",
    formatDateOnly(transcript?.date_of_graduation),
    rightCol,
    yR,
    labelW,
    valueW
  );
  yL = metaRow(doc, "Semester", transcript?.semester, leftCol, yL, labelW, valueW);

  y = Math.max(yL, yR) + 10;
  drawDashedLine(doc, left, y, right);
  y += 8;

  // --- Table header ---
  const cols = {
    code: { x: left, w: 70 },
    title: { x: left + 70, w: width - 70 - 70 - 50 },
    hours: { x: right - 70 - 50, w: 70 },
    grade: { x: right - 50, w: 50 },
  };

  write(doc, "Code", cols.code.x, y, { size: 9, bold: true, width: cols.code.w });
  write(doc, "Course Title", cols.title.x, y, { size: 9, bold: true, width: cols.title.w });
  write(doc, "Hours", cols.hours.x, y, {
    size: 9,
    bold: true,
    width: cols.hours.w,
    align: "right",
  });
  write(doc, "Grade", cols.grade.x, y, {
    size: 9,
    bold: true,
    width: cols.grade.w,
    align: "center",
  });
  y += 14;
  drawDashedLine(doc, left, y, right);
  y += 6;

  const pageBottom = doc.page.height - doc.page.margins.bottom - 150;

  const sorted = [...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (sorted.length === 0) {
    write(doc, "No units recorded on this transcript yet.", left, y + 8, {
      size: 9,
      color: BRAND.muted,
      width,
      align: "center",
    });
    y += 36;
  } else {
    for (const line of sorted) {
      if (y > pageBottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const hoursNum = Number(line.hours);
      const hoursStr = Number.isFinite(hoursNum) ? hoursNum.toFixed(2) : "0.00";
      const title = safeText(line.course_title, 80);
      write(doc, safeText(line.unit_code, 20), cols.code.x, y, { size: 9, width: cols.code.w });
      write(doc, title, cols.title.x, y, { size: 9, width: cols.title.w });
      write(doc, hoursStr, cols.hours.x, y, { size: 9, width: cols.hours.w, align: "right" });
      write(doc, safeText(line.grade, 4), cols.grade.x, y, {
        size: 9,
        bold: true,
        width: cols.grade.w,
        align: "center",
      });
      y += 13;
    }
  }

  y += 4;
  drawDashedLine(doc, left, y, right);
  y += 14;

  // --- Recommendation ---
  const rec = safeText(transcript?.recommendation, 180);
  write(doc, `RECOMMENDATION: ${rec || "—"}`, left, y, {
    size: 10,
    bold: true,
    width,
  });
  y += 22;

  // --- Grading legend ---
  write(doc, "KEY TO GRADING SYSTEM", left, y, { size: 9, bold: true, width });
  y += 13;
  for (const row of GRADING_LEGEND) {
    const text =
      row.grade === ""
        ? `${row.range.padEnd(12)} ${row.label}`
        : `${row.range.padEnd(12)} ${row.grade.padEnd(4)} ${row.label}`;
    write(doc, text, left, y, { size: 8, width: width * 0.55, color: BRAND.muted });
    y += 11;
  }

  y += 18;
  if (y > doc.page.height - doc.page.margins.bottom - 90) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  // --- Signature / dates ---
  write(doc, "SIGNED:", left, y, { size: 9, bold: true, width: 60 });
  doc
    .moveTo(left + 58, y + 18)
    .lineTo(left + 200, y + 18)
    .strokeColor(BRAND.line)
    .lineWidth(0.7)
    .stroke();
  write(doc, "Registrar (Academic & Student Affairs)", left + 58, y + 22, {
    size: 8,
    color: BRAND.muted,
    width: 200,
  });

  const dateX = left + width * 0.55;
  write(doc, "Date Issued:", dateX, y, { size: 9, bold: true, width: 80 });
  doc
    .moveTo(dateX + 78, y + 10)
    .lineTo(right, y + 10)
    .strokeColor(BRAND.line)
    .lineWidth(0.7)
    .stroke();
  if (transcript?.issued_at) {
    write(doc, formatDateOnly(transcript.issued_at), dateX + 78, y - 1, {
      size: 9,
      width: right - (dateX + 78),
    });
  }

  y += 40;
  write(doc, `Date Printed: ${formatPrintedDate(new Date())}`, left, y, {
    size: 8,
    color: BRAND.muted,
    width,
  });

  if (transcript?.status === "draft") {
    write(doc, "DRAFT — NOT AN OFFICIAL COPY", left, y + 14, {
      size: 8,
      bold: true,
      color: BRAND.gold,
      width,
      align: "center",
    });
  }

  doc.end();
  return done;
}

module.exports = {
  buildTranscriptPdfBuffer,
  GRADING_LEGEND,
  BRAND,
};
