/**
 * A4 student exam clearance PDF — one page.
 * Two-column table: exam details | teacher/invigilator signature.
 * Includes school logo, student photo, programme and cohort details.
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  short: "KASMS",
  green: "#006050",
  greenDark: "#004840",
  navy: "#1e2858",
  gold: "#c8a840",
  cream: "#f7f4ef",
  inkMuted: "#5a6478",
  white: "#ffffff",
  photoBg: "#dfe8e4",
  rowAlt: "#f3faf7",
  line: "#c5d4ce",
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_public", "public", "images", "logo.png"),
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

function safeText(value, maxLen = 120) {
  let s = String(value ?? "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "-";
  if (s.length > maxLen) return `${s.slice(0, maxLen - 3)}...`;
  return s;
}

function write(doc, text, x, y, opts = {}) {
  const {
    width,
    size = 9,
    color = BRAND.navy,
    bold = false,
    align = "left",
    height,
  } = opts;
  doc.fillOpacity(1);
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
  doc.text(String(text), x, y, {
    width,
    height,
    align,
    ellipsis: true,
    lineBreak: Boolean(height && height > size + 4),
  });
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeRange(startIso, endIso) {
  if (!startIso) return "-";
  const start = new Date(startIso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!endIso) return start;
  const end = new Date(endIso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${start} - ${end}`;
}

async function coverPhotoBuffer(profilePath, widthPt, heightPt) {
  const dpi = 200;
  const w = Math.max(1, Math.round((widthPt / 72) * dpi));
  const h = Math.max(1, Math.round((heightPt / 72) * dpi));
  return sharp(profilePath)
    .rotate()
    .resize(w, h, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

function drawPhotoPlaceholder(doc, x, y, w, h, fullName) {
  doc.roundedRect(x + 1, y + 1, w - 2, h - 2, 3).fill(BRAND.photoBg);
  const initials = String(fullName || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
    .replace(/[^A-Z]/g, "");
  write(doc, initials || "S", x, y + h / 2 - 10, {
    size: 18,
    bold: true,
    color: BRAND.green,
    width: w,
    align: "center",
  });
}

/**
 * @param {object} payload
 * @param {object} payload.student
 * @param {object} payload.period — serialized exam period with slots
 * @returns {Promise<Buffer>}
 */
async function buildExamCardPdf({ student, period }) {
  const photoW = 72;
  const photoH = 86;
  let photoBuffer = null;
  const profilePath = resolveProfilePath(student.profile_image);
  if (profilePath) {
    try {
      photoBuffer = await coverPhotoBuffer(profilePath, photoW, photoH);
    } catch {
      photoBuffer = null;
    }
  }

  const slots = Array.isArray(period?.slots) ? period.slots : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: `Exam Clearance - ${safeText(student.full_name || student.admission_number, 48)}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const marginX = 28;
    const contentW = pageW - marginX * 2;

    doc.rect(0, 0, pageW, pageH).fill(BRAND.white);
    doc.lineWidth(1.4).rect(14, 14, pageW - 28, pageH - 28).stroke(BRAND.green);
    doc.lineWidth(0.6).rect(18, 18, pageW - 36, pageH - 36).stroke(BRAND.gold);

    const logoPath = resolveLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, pageW / 2 - 18, 26, { width: 36, height: 36 });
      } catch {
        /* ignore */
      }
    }

    write(doc, BRAND.name.toUpperCase(), marginX, 66, {
      size: 11,
      bold: true,
      color: BRAND.greenDark,
      width: contentW,
      align: "center",
    });
    write(doc, "OFFICE OF EXAMINATIONS", marginX, 82, {
      size: 8,
      color: BRAND.inkMuted,
      width: contentW,
      align: "center",
    });
    doc.moveTo(marginX + 80, 96).lineTo(pageW - marginX - 80, 96).lineWidth(1.2).stroke(BRAND.gold);
    write(doc, "EXAMINATION CLEARANCE", marginX, 102, {
      size: 16,
      bold: true,
      color: BRAND.navy,
      width: contentW,
      align: "center",
    });
    write(
      doc,
      safeText(
        `Academic year ${period.academic_year || student.academic_year || "-"}   |   Issued ${student.issued_on || "-"}`,
        90
      ),
      marginX,
      122,
      { size: 8, color: BRAND.inkMuted, width: contentW, align: "center" }
    );

    let y = 142;
    const idH = 118;
    doc.roundedRect(marginX, y, contentW, idH, 4).lineWidth(0.8).stroke(BRAND.line);
    doc.rect(marginX, y, 6, idH).fill(BRAND.green);

    const photoX = marginX + 16;
    const photoY = y + 14;
    doc.rect(photoX, photoY, photoW, photoH).lineWidth(1).stroke(BRAND.green);
    if (photoBuffer) {
      try {
        doc.image(photoBuffer, photoX, photoY, { width: photoW, height: photoH });
      } catch {
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, student.full_name);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, student.full_name);
    }
    write(doc, "Affix photo", photoX, photoY + photoH + 2, {
      size: 6,
      color: BRAND.inkMuted,
      width: photoW,
      align: "center",
    });

    const infoX = photoX + photoW + 14;
    const infoW = 250;
    const field = (label, value, fy) => {
      write(doc, label, infoX, fy, { size: 6.5, color: BRAND.inkMuted, width: infoW });
      write(doc, safeText(value, 42), infoX, fy + 9, {
        size: 10,
        bold: true,
        color: BRAND.navy,
        width: infoW,
      });
    };
    field("FULL NAME", student.full_name, y + 16);
    field("ADMISSION NUMBER", student.admission_number, y + 40);
    field("PROGRAMME", student.programme_name || period.programme_name, y + 64);
    field(
      "YEAR / SEMESTER",
      `Year ${student.year_of_study || period.year_of_study || "-"}   Semester ${
        student.semester || period.semester || "-"
      }`,
      y + 88
    );

    const stampX = marginX + contentW - 118;
    const stampY = y + 28;
    doc.save();
    doc.translate(stampX + 48, stampY + 32);
    doc.rotate(-8);
    doc.roundedRect(-48, -28, 96, 56, 6).lineWidth(2.2).stroke(BRAND.green);
    doc.roundedRect(-44, -24, 88, 48, 4).lineWidth(0.6).stroke(BRAND.green);
    doc.restore();
    write(doc, "CLEARED", stampX, stampY + 16, {
      size: 13,
      bold: true,
      color: BRAND.green,
      width: 96,
      align: "center",
    });
    write(doc, "FEES MET", stampX, stampY + 34, {
      size: 7,
      bold: true,
      color: BRAND.greenDark,
      width: 96,
      align: "center",
    });

    y += idH + 14;
    write(doc, safeText(period.title || "End of semester examinations", 80), marginX, y, {
      size: 10,
      bold: true,
      color: BRAND.navy,
      width: contentW,
    });
    y += 14;
    const windowBits = [
      period.period_start ? `${formatDate(period.period_start)} - ${formatDate(period.period_end)}` : null,
      `${slots.length} registered paper${slots.length === 1 ? "" : "s"}`,
    ].filter(Boolean);
    write(doc, safeText(windowBits.join("   |   "), 100), marginX, y, {
      size: 8,
      color: BRAND.inkMuted,
      width: contentW,
    });

    y += 18;
    const cols = [
      { label: "NO", w: 28 },
      { label: "EXAMINATION PAPER", w: contentW * 0.34 },
      { label: "DATE", w: contentW * 0.16 },
      { label: "TIME", w: contentW * 0.14 },
      { label: "VENUE", w: contentW * 0.14 },
      { label: "INVIGILATOR", w: 0 },
    ];
    const used = cols.slice(0, -1).reduce((sum, col) => sum + col.w, 0);
    cols[cols.length - 1].w = contentW - used;
    const headerH = 20;
    let x = marginX;
    cols.forEach((col) => {
      doc.rect(x, y, col.w, headerH).fill(BRAND.green);
      write(doc, col.label, x + 4, y + 6, {
        size: 6.5,
        bold: true,
        color: BRAND.white,
        width: col.w - 8,
      });
      x += col.w;
    });

    y += headerH;
    const tableBottom = pageH - 118;
    const available = Math.max(36, tableBottom - y);
    const rowH = Math.min(36, Math.max(26, Math.floor(available / Math.max(slots.length || 1, 1))));
    const rowsToDraw = slots.slice(0, Math.max(1, Math.floor(available / 26)));

    if (!slots.length) {
      doc.rect(marginX, y, contentW, 32).stroke(BRAND.line);
      write(doc, "No examination papers are listed on this clearance.", marginX + 8, y + 10, {
        size: 9,
        color: BRAND.inkMuted,
        width: contentW - 16,
      });
      y += 32;
    } else {
      rowsToDraw.forEach((slot, index) => {
        const rowY = y + index * rowH;
        if (index % 2 === 1) doc.rect(marginX, rowY, contentW, rowH).fill(BRAND.rowAlt);
        const unitBit = [slot.unit_code, slot.title].filter(Boolean).join("  ");
        const values = [
          String(index + 1),
          safeText(unitBit || slot.unit_name, 42),
          formatDate(slot.starts_at).replace(/,?\s*\d{4}$/, ""),
          formatTimeRange(slot.starts_at, slot.ends_at),
          safeText(slot.venue || "-", 18),
          "",
        ];
        let cx = marginX;
        cols.forEach((col, colIndex) => {
          doc.rect(cx, rowY, col.w, rowH).lineWidth(0.4).stroke(BRAND.line);
          if (colIndex === cols.length - 1) {
            doc
              .moveTo(cx + 8, rowY + rowH - 8)
              .lineTo(cx + col.w - 8, rowY + rowH - 8)
              .lineWidth(0.6)
              .stroke(BRAND.line);
          } else {
            write(doc, values[colIndex], cx + 4, rowY + (rowH > 30 ? 8 : 6), {
              size: colIndex === 1 ? 8 : 7,
              bold: colIndex === 1,
              color: BRAND.navy,
              width: col.w - 8,
              height: rowH - 8,
            });
          }
          cx += col.w;
        });
      });
      y += rowsToDraw.length * rowH;
      if (slots.length > rowsToDraw.length) {
        write(
          doc,
          `Showing ${rowsToDraw.length} of ${slots.length} papers. Download the full timetable for the rest.`,
          marginX,
          y + 4,
          { size: 7, color: BRAND.inkMuted, width: contentW }
        );
      }
    }

    const footY = pageH - 96;
    write(
      doc,
      "Place this clearance on your desk at every paper together with your student ID. An invigilator signs after each paper. This document is valid only while the fee clearance remains CLEARED.",
      marginX,
      footY,
      { size: 7.5, color: BRAND.inkMuted, width: contentW }
    );

    const signY = footY + 28;
    const signW = contentW / 2 - 16;
    doc.moveTo(marginX, signY).lineTo(marginX + signW, signY).lineWidth(0.7).stroke(BRAND.navy);
    write(doc, "Student signature", marginX, signY + 4, { size: 7, color: BRAND.inkMuted, width: signW });
    const rightX = marginX + contentW / 2 + 16;
    doc.moveTo(rightX, signY).lineTo(rightX + signW, signY).lineWidth(0.7).stroke(BRAND.navy);
    write(doc, "Examinations office", rightX, signY + 4, { size: 7, color: BRAND.inkMuted, width: signW });
    write(doc, `${BRAND.short}  ·  STUDENT COPY`, marginX, pageH - 36, {
      size: 7,
      bold: true,
      color: BRAND.greenDark,
      width: contentW,
      align: "center",
    });

    doc.end();
  });
}

module.exports = {
  buildExamCardPdf,
};
