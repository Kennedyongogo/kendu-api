/**
 * CR80 / ISO ID-1 meal card PDF (85.60 × 53.98 mm).
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  short: "KASMS",
  green: "#006050",
  greenDark: "#004840",
  navy: "#1e2858",
  gold: "#c8a840",
  cream: "#f7f4ef",
  inkMuted: "#5a6478",
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

function clip(doc, text, maxLen) {
  const s = String(text || "").trim();
  if (!s) return "—";
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

/**
 * @param {object} card — meal card payload from mealController
 * @returns {Promise<Buffer>}
 */
function buildMealCardPdf(card) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [CR80.width, CR80.height],
      margin: 0,
      info: {
        Title: `Meal Card — ${card.admission_number || card.full_name}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = CR80.width;
    const H = CR80.height;

    // Background
    doc.rect(0, 0, W, H).fill(BRAND.cream);

    // Left brand strip
    doc.rect(0, 0, 8, H).fill(BRAND.green);
    doc.rect(8, 0, 2.5, H).fill(BRAND.gold);

    // Top bar
    doc.rect(10.5, 0, W - 10.5, 22).fill(BRAND.green);

    const logoPath = resolveLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, 16, 3.5, { height: 15 });
      } catch {
        /* ignore logo errors */
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#ffffff")
      .text("MEAL CARD", logoPath ? 36 : 16, 7, { width: W - 100, lineBreak: false });

    doc
      .font("Helvetica")
      .fontSize(5.5)
      .fillColor("rgba(255,255,255,0.85)")
      .text(BRAND.short, W - 52, 8, { width: 44, align: "right", lineBreak: false });

    // Photo
    const photoX = 16;
    const photoY = 28;
    const photoW = 52;
    const photoH = 64;
    doc.roundedRect(photoX, photoY, photoW, photoH, 4).fillAndStroke("#ffffff", BRAND.green);

    const profilePath = resolveProfilePath(card.profile_image);
    if (profilePath) {
      try {
        doc.save();
        doc.roundedRect(photoX + 1.5, photoY + 1.5, photoW - 3, photoH - 3, 3).clip();
        doc.image(profilePath, photoX + 1.5, photoY + 1.5, {
          fit: [photoW - 3, photoH - 3],
          align: "center",
          valign: "center",
        });
        doc.restore();
      } catch {
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, card.full_name);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, card.full_name);
    }

    // Details
    const textX = 76;
    let y = 30;

    doc.font("Helvetica").fontSize(5).fillColor(BRAND.inkMuted).text("FULL NAME", textX, y, {
      lineBreak: false,
    });
    y += 7;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(BRAND.navy)
      .text(clip(card.full_name, 28), textX, y, { width: W - textX - 10, lineBreak: false });
    y += 14;

    doc.font("Helvetica").fontSize(5).fillColor(BRAND.inkMuted).text("ADMISSION NO.", textX, y, {
      lineBreak: false,
    });
    y += 7;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(BRAND.greenDark)
      .text(clip(card.admission_number, 22), textX, y, { width: W - textX - 10, lineBreak: false });
    y += 14;

    doc.font("Helvetica").fontSize(5).fillColor(BRAND.inkMuted).text("PROGRAMME", textX, y, {
      lineBreak: false,
    });
    y += 7;
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(BRAND.navy)
      .text(clip(card.programme_name, 34), textX, y, { width: W - textX - 10, lineBreak: false });

    // Footer strip
    doc.rect(10.5, H - 28, W - 10.5, 28).fill(BRAND.greenDark);

    const yearLine = [
      card.year_of_study ? `Y${card.year_of_study}` : null,
      card.semester ? `Sem ${card.semester}` : null,
      card.academic_year || null,
    ]
      .filter(Boolean)
      .join(" · ");

    doc
      .font("Helvetica")
      .fontSize(5.5)
      .fillColor("rgba(255,255,255,0.8)")
      .text(yearLine || "Student meal access", 16, H - 22, {
        width: W - 80,
        lineBreak: false,
      });

    doc
      .font("Helvetica")
      .fontSize(5)
      .fillColor(BRAND.gold)
      .text(`Issued ${card.issued_on || "—"}`, 16, H - 12, {
        width: W - 80,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(6)
      .fillColor("#ffffff")
      .text("VALID", W - 48, H - 20, { width: 40, align: "right", lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(5)
      .fillColor(BRAND.gold)
      .text(clip(card.valid_label || "Current term", 14), W - 48, H - 11, {
        width: 40,
        align: "right",
        lineBreak: false,
      });

    doc.end();
  });
}

function drawPhotoPlaceholder(doc, x, y, w, h, fullName) {
  doc.roundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 3).fill("#dfe8e4");
  const initials = String(fullName || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(BRAND.green)
    .text(initials || "S", x, y + h / 2 - 8, { width: w, align: "center", lineBreak: false });
}

module.exports = {
  CR80,
  buildMealCardPdf,
};
