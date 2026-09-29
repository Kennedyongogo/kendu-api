/**
 * CR80 / ISO ID-1 meal card PDF (85.60 × 53.98 mm).
 * Uses only hex colors — PDFKit does not reliably parse rgba().
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const QRCode = require("qrcode");

const BRAND = {
  short: "KASMS",
  green: "#006050",
  greenDark: "#004840",
  navy: "#1e2858",
  gold: "#c8a840",
  cream: "#f7f4ef",
  inkMuted: "#5a6478",
  white: "#ffffff",
  photoBg: "#dfe8e4",
};

/** CR80 in PDF points (1 pt = 1/72 in; 1 in = 25.4 mm). */
const CR80 = {
  width: (85.6 * 72) / 25.4, // ≈ 242.65
  height: (53.98 * 72) / 25.4, // ≈ 153.07
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-public", "public", "images", "logo.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveProfilePath(profileImage) {
  if (!profileImage) return null;
  if (/^https?:\/\//i.test(String(profileImage))) return null;
  const name = String(profileImage).replace(/^\/uploads\/profiles\//, "");
  const full = path.join(__dirname, "..", "..", "uploads", "profiles", name);
  return fs.existsSync(full) ? full : null;
}

function safeText(value, maxLen) {
  let s = String(value ?? "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "-";
  if (s.length > maxLen) return `${s.slice(0, maxLen - 3)}...`;
  return s;
}

/** Draw text at an absolute position without shifting the document flow. */
function write(doc, text, x, y, opts = {}) {
  const {
    width,
    size = 8,
    color = BRAND.navy,
    bold = false,
    align = "left",
  } = opts;
  doc.fillOpacity(1);
  doc
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(color);
  doc.text(String(text), x, y, {
    width,
    align,
    lineBreak: false,
    ellipsis: false,
  });
}

/**
 * Crop/scale photo like CSS object-fit: cover so it fills the frame edge-to-edge.
 */
async function coverPhotoBuffer(profilePath, widthPt, heightPt) {
  const dpi = 220;
  const w = Math.max(1, Math.round((widthPt / 72) * dpi));
  const h = Math.max(1, Math.round((heightPt / 72) * dpi));
  return sharp(profilePath)
    .rotate() // honour EXIF orientation
    .resize(w, h, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/** Largest font size (down to minSize) at which `text` fits `maxWidth`; truncates if still too long. */
function fitText(doc, text, maxWidth, size, minSize, bold = true) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica");
  let s = size;
  while (s > minSize && doc.fontSize(s).widthOfString(text) > maxWidth) s -= 0.5;
  let out = text;
  doc.fontSize(s);
  while (out.length > 4 && doc.widthOfString(out) > maxWidth) out = `${out.slice(0, -4)}...`;
  return { text: out, size: s };
}

async function qrPngBuffer(payload) {
  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 360,
    color: { dark: "#0b1f3a", light: "#ffffff" },
  });
}

function buildMonthDayColumns(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const chunk = Math.ceil(daysInMonth / 3) || 10;
  const columns = [];
  for (let i = 0; i < days.length; i += chunk) {
    columns.push(days.slice(i, i + chunk));
  }
  while (columns.length < 3) columns.push([]);
  const monthLabel = date.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  return { monthLabel, columns: columns.slice(0, 3) };
}

function drawMealLogBack(doc, served = {}) {
  const W = CR80.width;
  const H = CR80.height;
  const { monthLabel, columns } = buildMonthDayColumns(new Date());

  doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(BRAND.cream);
  doc.rect(0, 0, W, 18).fill(BRAND.green);
  doc.rect(0, H - 14, W, 14).fill(BRAND.greenDark);

  write(doc, "MEAL LOG", 8, 5.5, { size: 7, bold: true, color: BRAND.white, width: 80 });
  write(doc, safeText(monthLabel.toUpperCase(), 22), W - 110, 5.5, {
    size: 7,
    bold: true,
    color: BRAND.white,
    width: 102,
    align: "right",
  });

  write(doc, "B breakfast  |  L lunch  |  S supper", 8, H - 10, {
    size: 5,
    color: BRAND.white,
    width: 150,
  });
  write(doc, "Filled = served", W - 78, H - 10, {
    size: 5,
    bold: true,
    color: BRAND.gold,
    width: 70,
    align: "right",
  });

  const gridTop = 22;
  const gridBottom = H - 16;
  const gridH = gridBottom - gridTop;
  const gap = 3;
  const colW = (W - 16 - gap * 2) / 3;
  const startX = 8;

  columns.forEach((days, colIdx) => {
    const x = startX + colIdx * (colW + gap);
    const headerH = 10;
    const rowH = Math.min(10, (gridH - headerH - 2) / Math.max(days.length, 1));

    doc.roundedRect(x, gridTop, colW, gridH, 2).fillAndStroke(BRAND.white, "#c5d4e8");
    doc.rect(x, gridTop, colW, headerH).fill(BRAND.greenDark);

    const headers = ["#", "B", "L", "S"];
    const cellW = colW / 4;
    headers.forEach((h, i) => {
      write(doc, h, x + i * cellW, gridTop + 2.5, {
        size: 5,
        bold: true,
        color: BRAND.white,
        width: cellW,
        align: "center",
      });
    });

    days.forEach((day, rowIdx) => {
      const y = gridTop + headerH + 1 + rowIdx * rowH;
      write(doc, String(day), x, y + Math.max(0, (rowH - 6) / 2), {
        size: 5.5,
        bold: true,
        color: BRAND.navy,
        width: cellW,
        align: "center",
      });
      const dayServed = served[String(day)] || {};
      ["B", "L", "S"].forEach((meal, idx) => {
        const bx = x + (idx + 1) * cellW + cellW / 2 - 3;
        const by = y + Math.max(0, (rowH - 6) / 2);
        if (dayServed[meal]) {
          doc.rect(bx, by, 6, 6).fill(BRAND.green);
          doc
            .lineWidth(0.8)
            .moveTo(bx + 1.2, by + 3.1)
            .lineTo(bx + 2.5, by + 4.5)
            .lineTo(bx + 4.9, by + 1.5)
            .stroke(BRAND.white);
        } else {
          doc.lineWidth(0.6).rect(bx, by, 6, 6).stroke(BRAND.green);
        }
      });
    });
  });
}

/**
 * @param {object} card — meal card payload from mealController
 * @param {{ qrPayload?: string, served?: object, version?: number }} [options]
 * @returns {Promise<Buffer>}
 */
async function buildMealCardPdf(card, { qrPayload = null, served = {}, version = null } = {}) {
  const photoX = 16;
  const photoY = 28;
  const photoW = 52;
  const photoH = 62;

  const qrBuffer = qrPayload ? await qrPngBuffer(qrPayload) : null;

  let photoBuffer = null;
  const profilePath = resolveProfilePath(card.profile_image);
  if (profilePath) {
    try {
      photoBuffer = await coverPhotoBuffer(profilePath, photoW, photoH);
    } catch {
      photoBuffer = null;
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [CR80.width, CR80.height],
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: `Meal Card - ${safeText(card.admission_number || card.full_name, 40)}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = CR80.width;
    const H = CR80.height;

    doc.rect(0, 0, W, H).fill(BRAND.cream);
    doc.rect(0, 0, 8, H).fill(BRAND.green);
    doc.rect(8, 0, 2.5, H).fill(BRAND.gold);
    doc.rect(10.5, 0, W - 10.5, 22).fill(BRAND.green);
    doc.rect(10.5, H - 28, W - 10.5, 28).fill(BRAND.greenDark);

    const logoPath = resolveLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, 14, 4, { height: 14, width: 14 });
      } catch {
        /* ignore */
      }
    }

    write(doc, "MEAL CARD", logoPath ? 32 : 14, 7, {
      size: 8,
      bold: true,
      color: BRAND.white,
      width: 120,
    });
    write(doc, BRAND.short, W - 50, 8, {
      size: 6,
      bold: true,
      color: BRAND.white,
      width: 40,
      align: "right",
    });

    // Photo frame — image fills the box edge-to-edge (cover crop)
    doc.roundedRect(photoX, photoY, photoW, photoH, 4).fillAndStroke(BRAND.white, BRAND.green);

    if (photoBuffer) {
      try {
        doc.image(photoBuffer, photoX, photoY, {
          width: photoW,
          height: photoH,
        });
        // Green border on top of the photo so edges stay neat
        doc.lineWidth(1.25).roundedRect(photoX, photoY, photoW, photoH, 4).stroke(BRAND.green);
      } catch {
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, card.full_name);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, card.full_name);
    }

    const textX = 76;
    const fullW = W - textX - 8;
    const qrSize = 48;
    const qrX = W - 8 - qrSize;
    const qrY = 26;
    const textW = qrBuffer ? qrX - textX - 5 : fullW;

    if (qrBuffer) {
      doc.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 3).fillAndStroke(BRAND.white, "#c5d4e8");
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    }

    const name = fitText(doc, safeText(card.full_name, 40), textW, 9, 6.5);
    const admission = fitText(doc, safeText(card.admission_number, 24), textW, 9, 7);
    const programme = fitText(doc, safeText(card.programme_name, 60), fullW, 7, 6);

    write(doc, "FULL NAME", textX, 29, { size: 5, color: BRAND.inkMuted, width: textW });
    write(doc, name.text, textX, 36, { size: name.size, bold: true, color: BRAND.navy, width: textW });

    write(doc, "ADMISSION NO.", textX, 51, { size: 5, color: BRAND.inkMuted, width: textW });
    write(doc, admission.text, textX, 58, {
      size: admission.size,
      bold: true,
      color: BRAND.greenDark,
      width: textW,
    });

    write(doc, "PROGRAMME", textX, 77, { size: 5, color: BRAND.inkMuted, width: fullW });
    write(doc, programme.text, textX, 84, {
      size: programme.size,
      bold: true,
      color: BRAND.navy,
      width: fullW,
    });

    const yearLine = [
      card.year_of_study ? `Y${card.year_of_study}` : null,
      card.semester ? `Sem ${card.semester}` : null,
      card.academic_year || null,
    ]
      .filter(Boolean)
      .join(" | ");

    write(doc, safeText(yearLine || "Student meal access", 40), 16, H - 22, {
      size: 6,
      color: BRAND.white,
      width: W - 80,
    });
    const issuedLine = version
      ? `Issued ${safeText(card.issued_on, 18)}  |  Card #${version}`
      : `Issued ${safeText(card.issued_on, 18)}`;
    write(doc, issuedLine, 16, H - 12, {
      size: 5,
      color: BRAND.gold,
      width: W - 80,
    });
    write(doc, "VALID", W - 48, H - 20, {
      size: 6,
      bold: true,
      color: BRAND.white,
      width: 40,
      align: "right",
    });
    write(doc, safeText(card.valid_label || "Current term", 14), W - 48, H - 11, {
      size: 5,
      color: BRAND.gold,
      width: 40,
      align: "right",
    });

    drawMealLogBack(doc, served);
    doc.end();
  });
}

function drawPhotoPlaceholder(doc, x, y, w, h, fullName) {
  doc.roundedRect(x + 2, y + 2, w - 4, h - 4, 3).fill(BRAND.photoBg);
  const initials = String(fullName || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .replace(/[^A-Z]/g, "");
  write(doc, initials || "S", x, y + h / 2 - 8, {
    size: 16,
    bold: true,
    color: BRAND.green,
    width: w,
    align: "center",
  });
}

module.exports = {
  CR80,
  buildMealCardPdf,
};
