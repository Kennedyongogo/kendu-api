const PDFDocument = require("pdfkit");
const { loadSchoolReportBranding } = require("./schoolReportBranding");

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_MARGIN = 56;

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_HEIGHT - BOTTOM_MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function writeWrapped(doc, text, x, y, width, opts = {}) {
  const fontSize = opts.fontSize || 9;
  const lineGap = opts.lineGap ?? 2;
  doc.font(opts.font || "Helvetica").fontSize(fontSize).fillColor(opts.color || "#334155");
  doc.text(String(text || "—"), x, y, { width, lineGap });
  return doc.y;
}

/**
 * Graded exam result PDF — score summary plus per-question answers and teacher comments.
 */
async function generateExamResultPdfBuffer(data) {
  const brand = await loadSchoolReportBranding();
  const primary = brand.primaryColor || "#0c2340";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    if (brand.logoPath) {
      try {
        doc.image(brand.logoPath, MARGIN, y, { fit: [44, 44] });
      } catch (_) {
        /* skip */
      }
    }
    doc.font("Helvetica-Bold").fontSize(14).fillColor(primary);
    doc.text(brand.name || "School", MARGIN + 52, y + 2, { width: CONTENT_WIDTH - 52, lineBreak: false });
    if (brand.tagline) {
      doc.font("Helvetica").fontSize(8).fillColor("#64748b");
      doc.text(brand.tagline, MARGIN + 52, y + 18, { width: CONTENT_WIDTH - 52, lineBreak: false });
    }
    y += 50;

    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(primary).stroke();
    y += 14;

    doc.font("Helvetica-Bold").fontSize(12).fillColor(primary);
    doc.text("Exam result", MARGIN, y, { lineBreak: false });
    y += 16;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
    doc.text(String(data.examTitle || "Exam"), MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 8;

    const infoRows = [
      ["Student", data.studentName || "—"],
      ["Subject", data.subjectName || "—"],
      ["Score", `${data.totalScore} / ${data.totalMax}`],
      ["Percentage", data.percentage != null ? `${data.percentage}%` : "—"],
      ["Grade", data.grade || "—"],
    ];
    if (data.gradeRemarks) infoRows.push(["Remarks", data.gradeRemarks]);
    if (data.gradedAt) {
      infoRows.push([
        "Graded on",
        new Date(data.gradedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      ]);
    }

    for (const [label, value] of infoRows) {
      y = ensureSpace(doc, y, 16);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
      doc.text(`${label}: `, MARGIN, y, { continued: true, lineBreak: false });
      doc.font("Helvetica").fillColor("#0f172a").text(String(value), { lineBreak: false });
      y += 14;
    }

    y += 8;
    y = ensureSpace(doc, y, 24);
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
    y += 14;

    if (data.showQuestionBreakdown === false && !(Array.isArray(data.workingPapers) && data.workingPapers.length)) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b");
      doc.text(
        "This was a PDF exam. Your teacher awarded an overall score — detailed feedback is not included in this PDF.",
        MARGIN,
        y,
        { width: CONTENT_WIDTH }
      );
      doc.end();
      return;
    }

    if (Array.isArray(data.questions) && data.questions.length) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(primary);
      doc.text("Question breakdown", MARGIN, y, { lineBreak: false });
      y += 18;

      data.questions.forEach((q, index) => {
        y = ensureSpace(doc, y, 80);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
        doc.text(`Question ${index + 1}`, MARGIN, y, { lineBreak: false });
        if (q.maxScore != null && Number(q.maxScore) > 0) {
          doc.font("Helvetica").fontSize(9).fillColor("#64748b");
          doc.text(`Score: ${q.score ?? "—"} / ${q.maxScore}`, MARGIN + CONTENT_WIDTH - 90, y, {
            width: 90,
            align: "right",
            lineBreak: false,
          });
        } else if (q.score != null) {
          doc.font("Helvetica").fontSize(9).fillColor("#64748b");
          doc.text(`Score: ${q.score} marks`, MARGIN + CONTENT_WIDTH - 90, y, {
            width: 90,
            align: "right",
            lineBreak: false,
          });
        }
        y += 14;

        y = ensureSpace(doc, y, 40);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
        doc.text("Question", MARGIN, y, { lineBreak: false });
        y += 12;
        y = writeWrapped(doc, q.question, MARGIN, y, CONTENT_WIDTH, { fontSize: 9, color: "#0f172a" }) + 8;

        y = ensureSpace(doc, y, 36);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
        doc.text("Your answer", MARGIN, y, { lineBreak: false });
        y += 12;
        y = writeWrapped(doc, q.answer, MARGIN, y, CONTENT_WIDTH, { fontSize: 9, color: "#0f172a" }) + 8;

        if (q.comment) {
          y = ensureSpace(doc, y, 36);
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#0369a1");
          doc.text("Teacher feedback", MARGIN, y, { lineBreak: false });
          y += 12;
          y = writeWrapped(doc, q.comment, MARGIN, y, CONTENT_WIDTH, {
            fontSize: 9,
            color: "#0c4a6e",
            font: "Helvetica-Oblique",
          }) + 8;
        }

        y += 6;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.25).strokeColor("#e2e8f0").stroke();
        y += 12;
      });
    }

    const workingPapers = Array.isArray(data.workingPapers) ? data.workingPapers : [];
    if (workingPapers.length) {
      y = ensureSpace(doc, y, 24);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(primary);
      doc.text("Uploaded working papers", MARGIN, y, { lineBreak: false });
      y += 18;

      workingPapers.forEach((paper, index) => {
        y = ensureSpace(doc, y, 48);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
        doc.text(`${index + 1}. ${paper.name || "Working paper"}`, MARGIN, y, { lineBreak: false });
        y += 14;
        if (paper.markedReturn?.name) {
          doc.font("Helvetica").fontSize(9).fillColor("#15803d");
          doc.text(`Marked copy: ${paper.markedReturn.name}`, MARGIN, y, { width: CONTENT_WIDTH });
          y = doc.y + 6;
        }
        if (paper.markerComment) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#0369a1");
          doc.text("Teacher feedback", MARGIN, y, { lineBreak: false });
          y += 12;
          y = writeWrapped(doc, paper.markerComment, MARGIN, y, CONTENT_WIDTH, {
            fontSize: 9,
            color: "#0c4a6e",
            font: "Helvetica-Oblique",
          }) + 8;
        }
        y += 8;
      });
    }

    if (!data.questions?.length && !workingPapers.length) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b");
      doc.text("No question details available.", MARGIN, y, { width: CONTENT_WIDTH });
    }

    doc.end();
  });
}

module.exports = { generateExamResultPdfBuffer };
