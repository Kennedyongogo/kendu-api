const PDFDocument = require("pdfkit");
const { loadSchoolReportBranding } = require("./schoolReportBranding");

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function paymentMethodLabel(method) {
  const m = String(method || "").toLowerCase();
  if (m === "mpesa") return "M-Pesa";
  if (m === "portal") return "Parent portal";
  if (m === "manual") return "Cash / bank";
  return method || "—";
}

function drawInfoRow(doc, label, value, y) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
  doc.text(`${label}: `, MARGIN, y, { continued: true, lineBreak: false });
  doc.font("Helvetica").text(String(value ?? "—"), { lineBreak: false });
  return y + 14;
}

/**
 * @param {object} data Receipt payload
 * @returns {Promise<Buffer>}
 */
async function buildFeePaymentReceiptPdf(data) {
  const brand = await loadSchoolReportBranding();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const primary = brand.primaryColor || "#0c2340";
      const secondary = brand.secondaryColor || "#c9a227";
      let y = MARGIN;

      if (brand.logoPath) {
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
      y += 58;

      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(primary).stroke();
      y += 12;

      doc.font("Helvetica-Bold").fontSize(12).fillColor(primary);
      doc.text("Payment receipt", MARGIN, y, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(secondary);
      doc.text(data.receiptNumber || "—", MARGIN, y, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
      y += 22;

      const amountPaid = Number(data.amount || 0);
      doc.fillColor("#f8fafc").rect(MARGIN, y, CONTENT_WIDTH, 52).fill();
      doc.strokeColor("#e2e8f0").rect(MARGIN, y, CONTENT_WIDTH, 52).stroke();
      doc.font("Helvetica").fontSize(9).fillColor("#64748b");
      doc.text("Amount received", MARGIN + 14, y + 10, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(20).fillColor(primary);
      doc.text(`KES ${money(amountPaid)}`, MARGIN + 14, y + 24, { lineBreak: false });
      y += 64;

      y = drawInfoRow(doc, "Payment date", fmtDateTime(data.paidAt), y);
      y = drawInfoRow(doc, "Payment method", paymentMethodLabel(data.paymentMethod), y);
      y = drawInfoRow(doc, "Transaction reference", data.reference || "—", y);
      y = drawInfoRow(doc, "Invoice", data.invoiceNumber || "—", y);
      y = drawInfoRow(doc, "Student", data.studentName || "—", y);
      y = drawInfoRow(doc, "Admission no.", data.admissionNumber || "—", y);
      y = drawInfoRow(doc, "Level / term", data.levelName || "—", y);
      if (data.parentName) y = drawInfoRow(doc, "Paid by", data.parentName, y);
      y += 8;

      const applied = Number(data.appliedToInvoice || 0);
      const excess = Number(data.excessAmount || 0);
      const balanceAfter = Number(data.invoiceBalanceAfter);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(primary);
      doc.text("Allocation", MARGIN, y, { lineBreak: false });
      y += 16;

      const rows = [
        ["Applied to invoice", `KES ${money(applied)}`],
        ...(excess > 0.01 ? [["Credit / overpayment", `KES ${money(excess)}`]] : []),
        ...(Number.isFinite(balanceAfter) ? [["Invoice balance after payment", `KES ${money(balanceAfter)}`]] : []),
      ];

      const boxH = 10 + rows.length * 16 + 8;
      doc.fillColor("#fff").rect(MARGIN, y, CONTENT_WIDTH, boxH).fill();
      doc.strokeColor("#e2e8f0").rect(MARGIN, y, CONTENT_WIDTH, boxH).stroke();
      let sy = y + 10;
      for (const [label, value] of rows) {
        doc.font("Helvetica").fontSize(9).fillColor("#334155");
        doc.text(label, MARGIN + 12, sy, { width: CONTENT_WIDTH * 0.55, lineBreak: false });
        doc.font("Helvetica-Bold").text(value, MARGIN + CONTENT_WIDTH * 0.55, sy, {
          width: CONTENT_WIDTH * 0.4,
          align: "right",
          lineBreak: false,
        });
        sy += 16;
      }
      y += boxH + 12;

      if (data.notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(primary);
        doc.text("Notes", MARGIN, y, { lineBreak: false });
        y += 14;
        doc.font("Helvetica").fontSize(8).fillColor("#64748b");
        doc.text(String(data.notes).slice(0, 400), MARGIN, y, { width: CONTENT_WIDTH });
        y += 24;
      }

      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
      y += 10;
      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8");
      doc.text(
        "This is an official school payment receipt. Keep it for your records.",
        MARGIN,
        y,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false }
      );
      y += 12;
      doc.text(
        `Generated ${new Date().toLocaleString("en-GB")} · ${brand.name}`,
        MARGIN,
        y,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildFeePaymentReceiptPdf };
