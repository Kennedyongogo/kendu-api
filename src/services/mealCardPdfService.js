/**
 * CR80 / ISO ID-1 meal card PDF (85.60 × 53.98 mm).
 * Uses only hex colors — PDFKit does not reliably parse rgba().
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

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

/**
 * @param {object} card — meal card payload from mealController
 * @returns {Promise<Buffer>}
 */
async function buildMealCardPdf(card) {
  const photoX = 16;
  const photoY = 28;
  const photoW = 52;
  const photoH = 62;

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
    const textW = W - textX - 8;
    const fullName = safeText(card.full_name, 26);
    const admission = safeText(card.admission_number, 22);
    const programme = safeText(card.programme_name, 36);

    write(doc, "FULL NAME", textX, 30, { size: 5, color: BRAND.inkMuted, width: textW });
    write(doc, fullName, textX, 37, { size: 9, bold: true, color: BRAND.navy, width: textW });

    write(doc, "ADMISSION NO.", textX, 52, { size: 5, color: BRAND.inkMuted, width: textW });
    write(doc, admission, textX, 59, { size: 9, bold: true, color: BRAND.greenDark, width: textW });

    write(doc, "PROGRAMME", textX, 74, { size: 5, color: BRAND.inkMuted, width: textW });
    write(doc, programme, textX, 81, { size: 7, bold: true, color: BRAND.navy, width: textW });

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
    write(doc, `Issued ${safeText(card.issued_on, 18)}`, 16, H - 12, {
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
