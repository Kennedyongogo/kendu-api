const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  tagline: "Train where care meets calling",
  green: "#006050",
  greenDark: "#004840",
  navy: "#1e2858",
  gold: "#c8a840",
  inkMuted: "#5a6478",
};

const money = (value, currency = "KES") =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMethod = (method) => {
  const labels = {
    mpesa: "M-Pesa",
    bank: "Bank transfer",
    cash: "Cash",
    card: "Card",
    other: "Other",
  };
  return labels[method] || method || "—";
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-public", "public", "images", "logo.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/** Draw text in a fixed box so PDFKit never auto-adds a second page. */
function fixedText(doc, text, x, y, width, options = {}) {
  const { height = 14, font = "Helvetica", size = 9, color = BRAND.navy, align = "left", bold = false } =
    options;
  doc.font(bold ? `${font}-Bold` : font).fontSize(size).fillColor(color);
  doc.text(String(text ?? "—"), x, y, {
    width,
    height,
    align,
    ellipsis: true,
    lineBreak: false,
  });
}

function drawHeader(doc, receiptNo) {
  const logoPath = resolveLogoPath();
  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;

  if (logoPath) {
    doc.image(logoPath, left, top, { height: 42 });
  }

  const textX = logoPath ? left + 56 : left;
  fixedText(doc, BRAND.name, textX, top + 2, contentWidth - 148, {
    height: 16,
    size: 11,
    bold: true,
    color: BRAND.navy,
  });
  fixedText(doc, BRAND.tagline, textX, top + 18, contentWidth - 148, {
    height: 12,
    size: 8,
    color: BRAND.inkMuted,
  });

  doc.roundedRect(right - 138, top, 138, 40, 6).fillAndStroke("#f4faf8", BRAND.green);
  fixedText(doc, "RECEIPT NO.", right - 130, top + 8, 122, {
    height: 10,
    size: 7.5,
    bold: true,
    color: BRAND.greenDark,
    align: "center",
  });
  fixedText(doc, receiptNo, right - 130, top + 20, 122, {
    height: 14,
    size: 9,
    bold: true,
    align: "center",
  });

  const bandY = top + 52;
  doc.roundedRect(left, bandY, contentWidth, 28, 6).fill(BRAND.green);
  fixedText(doc, "OFFICIAL FEE PAYMENT RECEIPT", left, bandY + 8, contentWidth, {
    height: 14,
    size: 12,
    bold: true,
    color: "#ffffff",
    align: "center",
  });

  return bandY + 40;
}

function drawSectionTitle(doc, x, y, width, title) {
  fixedText(doc, title.toUpperCase(), x, y, width, {
    height: 12,
    size: 8.5,
    bold: true,
    color: BRAND.greenDark,
  });
  return y + 14;
}

function drawKeyValueRows(doc, x, y, width, rows) {
  const labelWidth = 88;
  const rowHeight = 17;

  rows.forEach(([label, value], index) => {
    if (index % 2 === 0) {
      doc.roundedRect(x, y - 1, width, rowHeight, 3).fill("#f7faf8");
    }
    fixedText(doc, label, x + 6, y + 3, labelWidth, {
      height: 12,
      size: 8,
      color: BRAND.inkMuted,
    });
    fixedText(doc, value, x + labelWidth + 4, y + 3, width - labelWidth - 10, {
      height: 12,
      size: 8.5,
      bold: true,
    });
    y += rowHeight;
  });

  return y + 4;
}

function drawAmountHighlight(doc, y, amount, currency) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const boxHeight = 46;

  doc
    .roundedRect(left, y, right - left, boxHeight, 8)
    .lineWidth(1)
    .fillAndStroke("#fffdf5", BRAND.gold);

  fixedText(doc, "Amount received", left + 14, y + 8, 160, {
    height: 10,
    size: 8,
    color: BRAND.inkMuted,
  });
  fixedText(doc, money(amount, currency), left + 14, y + 20, right - left - 28, {
    height: 22,
    size: 18,
    bold: true,
    color: BRAND.greenDark,
  });

  return y + boxHeight + 10;
}

function drawSummaryStrip(doc, y, summary) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const colWidth = width / 3;
  const items = [
    ["Total billed", money(summary.total_charged, summary.currency)],
    ["Total paid", money(summary.total_paid, summary.currency)],
    ["Balance", money(summary.balance, summary.currency)],
  ];

  doc.roundedRect(left, y, width, 42, 8).fill("#f4faf8");
  items.forEach(([label, value], index) => {
    const x = left + index * colWidth;
    fixedText(doc, label, x + 8, y + 8, colWidth - 16, {
      height: 10,
      size: 7.5,
      color: BRAND.inkMuted,
      align: "center",
    });
    fixedText(doc, value, x + 8, y + 20, colWidth - 16, {
      height: 14,
      size: 10,
      bold: true,
      align: "center",
    });
  });

  return y + 50;
}

function drawFooter(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 36;

  doc
    .moveTo(left, bottom)
    .lineTo(right, bottom)
    .lineWidth(0.8)
    .strokeColor("#d7e3df")
    .stroke();

  doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.inkMuted);
  doc.text(
    "Computer-generated receipt from the Kendu student portal. Present with your admission number for verification.",
    left,
    bottom + 8,
    { width: right - left, align: "center", lineBreak: false }
  );

  fixedText(doc, `Generated ${formatDateTime(new Date())}`, left, bottom + 22, right - left, {
    height: 10,
    size: 7,
    color: "#8a93a8",
    align: "center",
  });
}

async function generateFeePaymentReceiptPdf({ payment, student, summary }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      autoFirstPage: true,
      bufferPages: false,
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const colGap = 14;
    const colWidth = (contentWidth - colGap) / 2;
    const receiptNo = payment.provider_receipt || payment.reference;

    let y = drawHeader(doc, receiptNo);

    const studentStartY = y;
    let leftY = drawSectionTitle(doc, left, studentStartY, colWidth, "Student details");
    leftY = drawKeyValueRows(doc, left, leftY, colWidth, [
      ["Name", student.full_name],
      ["Admission", student.admission_number || "—"],
      ["Programme", student.programme?.name || "—"],
      [
        "Period",
        student.year_of_study
          ? `Yr ${student.year_of_study} · Sem ${student.semester || 1}`
          : "—",
      ],
    ]);

    let rightY = drawSectionTitle(doc, left + colWidth + colGap, studentStartY, colWidth, "Payment details");
    rightY = drawKeyValueRows(doc, left + colWidth + colGap, rightY, colWidth, [
      ["Status", String(payment.status || "").toUpperCase()],
      ["Method", formatMethod(payment.method)],
      ["Date", formatDateTime(payment.paid_at || payment.createdAt)],
      ["Reference", payment.reference],
      ["Receipt", payment.provider_receipt || "—"],
    ]);

    y = Math.max(leftY, rightY) + 4;
    y = drawAmountHighlight(doc, y, payment.amount, payment.currency);

    if (summary) {
      y = drawSectionTitle(doc, left, y, contentWidth, "Account summary");
      y = drawSummaryStrip(doc, y, summary);
    }

    drawFooter(doc);
    doc.end();
  });
}

module.exports = {
  generateFeePaymentReceiptPdf,
};
