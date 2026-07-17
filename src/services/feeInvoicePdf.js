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

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function halfPhaseLabel(phase) {
  if (phase === "first_half") return "1st half";
  if (phase === "second_half") return "2nd half";
  return String(phase || "Half");
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "partial") return "Partially paid";
  if (s === "sent") return "Awaiting payment";
  if (s === "draft") return "Draft";
  if (s === "cancelled") return "Cancelled";
  return status || "—";
}

function paymentMethodLabel(method) {
  const m = String(method || "").toLowerCase();
  if (m === "mpesa") return "M-Pesa";
  if (m === "portal") return "Parent portal";
  if (m === "manual") return "Cash / bank";
  return method || "—";
}

function checkPageBreak(doc, y, required = 80) {
  if (y + required > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawSectionTitle(doc, title, y, primary) {
  y = checkPageBreak(doc, y, 36);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary);
  doc.text(title, MARGIN, y, { width: CONTENT_WIDTH, lineBreak: false });
  return y + 16;
}

function drawInfoRow(doc, label, value, y) {
  y = checkPageBreak(doc, y, 20);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
  doc.text(`${label}: `, MARGIN, y, { continued: true, lineBreak: false });
  doc.font("Helvetica").text(String(value ?? "—"), { lineBreak: false });
  return y + 14;
}

function drawHalfBreakdown(doc, phase, y, primary) {
  const items = Array.isArray(phase?.items) ? phase.items.filter((it) => it?.name || it?.amount) : [];
  const phaseTotal = Number(phase?.amount || 0);

  y = checkPageBreak(doc, y, 40 + items.length * 14);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(primary);
  doc.text(`${halfPhaseLabel(phase?.phase)} — KES ${money(phaseTotal)}`, MARGIN, y, { lineBreak: false });
  y += 14;

  if (!items.length) {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text("No line items listed for this half.", MARGIN + 8, y, { lineBreak: false });
    return y + 16;
  }

  for (const it of items) {
    y = checkPageBreak(doc, y, 16);
    doc.font("Helvetica").fontSize(8).fillColor("#334155");
    doc.text(`• ${it.name || "Fee item"}`, MARGIN + 8, y, {
      width: CONTENT_WIDTH * 0.68,
      lineBreak: false,
    });
    doc.text(`KES ${money(it.amount)}`, MARGIN + CONTENT_WIDTH * 0.7, y, {
      width: CONTENT_WIDTH * 0.3,
      align: "right",
      lineBreak: false,
    });
    y += 13;
  }
  return y + 4;
}

/**
 * @param {object} data Invoice payload for PDF rendering
 * @returns {Promise<Buffer>}
 */
async function buildFeeInvoicePdf(data) {
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

      doc.font("Helvetica").fontSize(8).fillColor("#64748b");
      const contactParts = [brand.phone, brand.email, brand.addressLine].filter(Boolean);
      if (contactParts.length) {
        doc.text(contactParts.join(" · "), MARGIN + 56, y + 34, { width: CONTENT_WIDTH - 56, lineBreak: false });
      }
      y += 58;

      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(primary).stroke();
      y += 12;

      doc.font("Helvetica-Bold").fontSize(12).fillColor(primary);
      doc.text("School fee invoice", MARGIN, y, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(secondary);
      doc.text(data.invoiceNumber || "—", MARGIN, y, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
      y += 20;

      y = drawInfoRow(doc, "Student", data.studentName, y);
      y = drawInfoRow(doc, "Admission no.", data.admissionNumber, y);
      y = drawInfoRow(doc, "Class", data.className, y);
      y = drawInfoRow(doc, "Level / term", data.levelName, y);
      y = drawInfoRow(doc, "Curriculum", data.curriculumName, y);
      if (data.parentName) y = drawInfoRow(doc, "Parent / guardian", data.parentName, y);
      y = drawInfoRow(doc, "Invoice date", fmtDate(data.invoiceDate), y);
      y = drawInfoRow(doc, "Status", statusLabel(data.status), y);
      y += 6;

      const breakdown = Array.isArray(data.paymentBreakdown) ? data.paymentBreakdown : [];
      if (breakdown.length) {
        y = drawSectionTitle(doc, "Fee breakdown", y, primary);
        for (const phase of breakdown) {
          y = drawHalfBreakdown(doc, phase, y, primary);
        }
        y += 4;
      }

      y = drawSectionTitle(doc, "Amount summary", y, primary);
      const summaryRows = [
        ["Term fee", `KES ${money(data.termFeeAmount)}`],
        ["Amount paid", `KES ${money(data.amountPaid)}`],
        ["Balance due", `KES ${money(data.balance)}`],
      ];
      if (Number(data.creditBalance) > 0.01) {
        summaryRows.push(["Credit on level", `KES ${money(data.creditBalance)}`]);
      }

      const boxH = 14 + summaryRows.length * 16 + 10;
      y = checkPageBreak(doc, y, boxH);
      doc.fillColor("#f8fafc").rect(MARGIN, y, CONTENT_WIDTH, boxH).fill();
      doc.strokeColor("#e2e8f0").rect(MARGIN, y, CONTENT_WIDTH, boxH).stroke();
      let sy = y + 10;
      for (const [label, value] of summaryRows) {
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

      const payments = Array.isArray(data.payments) ? data.payments : [];
      if (payments.length) {
        y = drawSectionTitle(doc, "Payment history", y, primary);
        const colDate = MARGIN;
        const colMethod = MARGIN + CONTENT_WIDTH * 0.28;
        const colRef = MARGIN + CONTENT_WIDTH * 0.5;
        const colAmt = MARGIN + CONTENT_WIDTH * 0.78;
        const rowH = 18;

        y = checkPageBreak(doc, y, rowH + 8);
        doc.fillColor(primary).rect(MARGIN, y, CONTENT_WIDTH, rowH).fill();
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
        doc.text("Date", colDate + 4, y + 5, { width: colMethod - colDate - 6, lineBreak: false });
        doc.text("Method", colMethod, y + 5, { width: colRef - colMethod - 4, lineBreak: false });
        doc.text("Reference", colRef, y + 5, { width: colAmt - colRef - 4, lineBreak: false });
        doc.text("Amount", colAmt, y + 5, { width: MARGIN + CONTENT_WIDTH - colAmt - 4, lineBreak: false });
        y += rowH;

        for (let i = 0; i < payments.length; i++) {
          y = checkPageBreak(doc, y, rowH);
          if (i % 2 === 0) {
            doc.fillColor("#f8fafc").rect(MARGIN, y, CONTENT_WIDTH, rowH).fill();
          }
          const p = payments[i];
          doc.font("Helvetica").fontSize(8).fillColor("#334155");
          doc.text(fmtDate(p.paid_at), colDate + 4, y + 5, { width: colMethod - colDate - 6, lineBreak: false });
          doc.text(paymentMethodLabel(p.payment_method), colMethod, y + 5, {
            width: colRef - colMethod - 4,
            lineBreak: false,
          });
          doc.text(String(p.reference || "—").slice(0, 24), colRef, y + 5, {
            width: colAmt - colRef - 4,
            lineBreak: false,
          });
          doc.text(`KES ${money(p.amount)}`, colAmt, y + 5, {
            width: MARGIN + CONTENT_WIDTH - colAmt - 4,
            lineBreak: false,
          });
          y += rowH;
        }
        y += 8;
      }

      if (data.notes) {
        y = drawSectionTitle(doc, "Notes", y, primary);
        y = checkPageBreak(doc, y, 40);
        doc.font("Helvetica").fontSize(8).fillColor("#64748b");
        doc.text(String(data.notes).slice(0, 600), MARGIN, y, { width: CONTENT_WIDTH });
        y += 28;
      }

      y = checkPageBreak(doc, y, 30);
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
      y += 10;
      doc.font("Helvetica").fontSize(7).fillColor("#94a3b8");
      doc.text(
        `Generated ${new Date().toLocaleString("en-GB")} · ${brand.name}${brand.website ? ` · ${brand.website}` : ""}`,
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

module.exports = { buildFeeInvoicePdf };
