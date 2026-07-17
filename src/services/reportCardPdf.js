const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { loadSchoolReportBranding } = require("./schoolReportBranding");

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Single-page report card PDF — footer sits directly under content (no extra blank page).
 */
async function generateReportCardPdf(data) {
  const brand = await loadSchoolReportBranding();
  const uploadDir = path.join(__dirname, "..", "..", "uploads", "report-cards");
  ensureDir(uploadDir);
  const filename = `report-card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.pdf`;
  const filePath = path.join(uploadDir, filename);
  const publicUrl = `/uploads/report-cards/${filename}`;

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const primary = brand.primaryColor || "#0c2340";
  let y = MARGIN;

  if (brand.logoPath && fs.existsSync(brand.logoPath)) {
    try {
      doc.image(brand.logoPath, MARGIN, y, { fit: [48, 48] });
    } catch (_) {
      /* skip */
    }
  }

  doc.font("Helvetica-Bold").fontSize(15).fillColor(primary);
  doc.text(brand.name, MARGIN + 56, y + 2, { width: CONTENT_WIDTH - 56, lineBreak: false });
  if (brand.tagline) {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text(brand.tagline, MARGIN + 56, y + 20, { width: CONTENT_WIDTH - 56, lineBreak: false });
  }
  y += 54;

  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(primary).stroke();
  y += 12;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(primary);
  doc.text("Student report card", MARGIN, y, { lineBreak: false });
  y += 18;

  if (data.title) {
    doc.font("Helvetica").fontSize(10).fillColor("#334155");
    doc.text(data.title, MARGIN, y, { width: CONTENT_WIDTH, lineBreak: false });
    y += 14;
  }

  const infoRows = [
    ["Student", data.studentName],
    ["Admission no.", data.admissionNumber || "—"],
    ["Class", data.className],
    ["Level", data.levelName || "—"],
    ["Date", new Date().toLocaleDateString("en-GB")],
  ];
  for (const [label, value] of infoRows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
    doc.text(`${label}: `, MARGIN, y, { continued: true, lineBreak: false });
    doc.font("Helvetica").text(String(value), { lineBreak: false });
    y += 14;
  }

  y += 6;
  const colExam = MARGIN;
  const colMarks = MARGIN + CONTENT_WIDTH * 0.52;
  const colGrade = MARGIN + CONTENT_WIDTH * 0.8;
  const rowH = 18;

  doc.fillColor(primary).rect(MARGIN, y, CONTENT_WIDTH, rowH).fill();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
  doc.text("Exam", colExam + 4, y + 5, { width: colMarks - colExam - 6, lineBreak: false });
  doc.text("Marks", colMarks, y + 5, { width: colGrade - colMarks - 4, lineBreak: false });
  doc.text("Grade", colGrade, y + 5, { width: MARGIN + CONTENT_WIDTH - colGrade - 4, lineBreak: false });
  y += rowH;

  const tableLines = Array.isArray(data.lines) ? data.lines : [];
  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    if (i % 2 === 0) {
      doc.fillColor("#f8fafc").rect(MARGIN, y, CONTENT_WIDTH, rowH).fill();
    }
    const marks =
      line.marks_obtained != null && line.total_marks != null
        ? `${line.marks_obtained} / ${line.total_marks}`
        : line.marks_obtained != null
          ? String(line.marks_obtained)
          : "—";
    const examTitle = String(line.exam_title || "Exam").trim() || "Exam";
    doc.font("Helvetica").fontSize(8).fillColor("#334155");
    doc.text(examTitle, colExam + 4, y + 5, { width: colMarks - colExam - 8, lineBreak: false });
    doc.text(marks, colMarks, y + 5, { width: colGrade - colMarks - 4, lineBreak: false });
    doc.text(String(line.grade || "—"), colGrade, y + 5, {
      width: MARGIN + CONTENT_WIDTH - colGrade - 4,
      lineBreak: false,
    });
    y += rowH;
  }

  y += 10;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary);
  doc.text(
    `Total: ${data.totalObtained}${data.totalPossible != null ? ` / ${data.totalPossible}` : ""}`,
    MARGIN,
    y,
    { lineBreak: false }
  );
  y += 14;
  if (data.overallGrade) {
    doc.text(`Overall grade: ${data.overallGrade}`, MARGIN, y, { lineBreak: false });
    y += 14;
  }
  if (data.overallRemarks) {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text(String(data.overallRemarks).slice(0, 120), MARGIN, y, {
      width: CONTENT_WIDTH,
      lineBreak: false,
    });
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { filePath, publicUrl };
}

module.exports = { generateReportCardPdf };
