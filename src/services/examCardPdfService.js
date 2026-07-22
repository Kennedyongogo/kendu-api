/**
 * A4 student exam card PDF — one page.
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
        Title: `Exam Card - ${safeText(student.full_name || student.admission_number, 48)}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const marginX = 36;
    const contentW = pageW - marginX * 2;

    // Page background
    doc.rect(0, 0, pageW, pageH).fill(BRAND.white);

    // Top brand bar
    doc.rect(0, 0, pageW, 64).fill(BRAND.green);
    doc.rect(0, 64, pageW, 4).fill(BRAND.gold);

    const logoPath = resolveLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, marginX, 12, { width: 40, height: 40 });
      } catch {
        /* ignore */
      }
    }

    const titleX = logoPath ? marginX + 50 : marginX;
    write(doc, BRAND.short, titleX, 14, {
      size: 11,
      bold: true,
      color: BRAND.white,
      width: 280,
    });
    write(doc, BRAND.name, titleX, 30, {
      size: 8,
      color: BRAND.cream,
      width: 340,
    });
    write(doc, "OFFICIAL EXAM CARD", pageW - marginX - 160, 22, {
      size: 12,
      bold: true,
      color: BRAND.gold,
      width: 160,
      align: "right",
    });

    // Student identity card
    let y = 84;
    doc.roundedRect(marginX, y, contentW, 108, 8).fill(BRAND.cream);
    doc.roundedRect(marginX, y, contentW, 108, 8).lineWidth(1).stroke(BRAND.line);

    const photoX = marginX + 12;
    const photoY = y + 11;
    doc.roundedRect(photoX, photoY, photoW, photoH, 5).fillAndStroke(BRAND.white, BRAND.green);
    if (photoBuffer) {
      try {
        doc.image(photoBuffer, photoX, photoY, { width: photoW, height: photoH });
        doc.lineWidth(1.2).roundedRect(photoX, photoY, photoW, photoH, 5).stroke(BRAND.green);
      } catch {
        drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, student.full_name);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH, student.full_name);
    }

    const infoX = photoX + photoW + 16;
    const infoW = contentW - photoW - 40;
    write(doc, "STUDENT", infoX, y + 12, { size: 7, color: BRAND.inkMuted, width: infoW });
    write(doc, safeText(student.full_name, 42), infoX, y + 24, {
      size: 13,
      bold: true,
      color: BRAND.navy,
      width: infoW,
    });

    const metaLeft = infoX;
    const metaRight = infoX + infoW / 2;
    const metaColW = infoW / 2 - 8;

    write(doc, "ADMISSION NO.", metaLeft, y + 46, { size: 6.5, color: BRAND.inkMuted, width: metaColW });
    write(doc, safeText(student.admission_number, 24), metaLeft, y + 56, {
      size: 10,
      bold: true,
      color: BRAND.greenDark,
      width: metaColW,
    });

    write(doc, "PROGRAMME", metaRight, y + 46, { size: 6.5, color: BRAND.inkMuted, width: metaColW });
    write(doc, safeText(student.programme_name || period.programme_name, 34), metaRight, y + 56, {
      size: 9,
      bold: true,
      color: BRAND.navy,
      width: metaColW,
    });

    write(doc, "YEAR / SEMESTER", metaLeft, y + 76, { size: 6.5, color: BRAND.inkMuted, width: metaColW });
    write(
      doc,
      `Year ${student.year_of_study || period.year_of_study || "-"}  |  Semester ${
        student.semester || period.semester || "-"
      }`,
      metaLeft,
      y + 86,
      { size: 9, bold: true, color: BRAND.navy, width: metaColW }
    );

    write(doc, "ACADEMIC YEAR", metaRight, y + 76, { size: 6.5, color: BRAND.inkMuted, width: metaColW });
    write(doc, safeText(period.academic_year || student.academic_year, 20), metaRight, y + 86, {
      size: 9,
      bold: true,
      color: BRAND.navy,
      width: metaColW,
    });

    // Period title band
    y = 206;
    doc.roundedRect(marginX, y, contentW, 36, 6).fill(BRAND.greenDark);
    write(doc, safeText(period.title || "Examination timetable", 70), marginX + 12, y + 7, {
      size: 11,
      bold: true,
      color: BRAND.white,
      width: contentW - 24,
    });
    const windowLabel = [
      period.period_start || period.period_end
        ? `${formatDate(period.period_start)} - ${formatDate(period.period_end)}`
        : null,
      `${slots.length} paper${slots.length === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join("  ·  ");
    write(doc, safeText(windowLabel, 90), marginX + 12, y + 22, {
      size: 8,
      color: BRAND.gold,
      width: contentW - 24,
    });

    // Table header
    y = 256;
    const examColW = contentW * 0.62;
    const signColW = contentW - examColW;
    const headerH = 22;

    doc.rect(marginX, y, examColW, headerH).fill(BRAND.green);
    doc.rect(marginX + examColW, y, signColW, headerH).fill(BRAND.greenDark);
    write(doc, "EXAM / PAPER", marginX + 10, y + 6, {
      size: 8,
      bold: true,
      color: BRAND.white,
      width: examColW - 16,
    });
    write(doc, "TEACHER / INVIGILATOR SIGNATURE", marginX + examColW + 10, y + 6, {
      size: 8,
      bold: true,
      color: BRAND.white,
      width: signColW - 16,
    });

    y += headerH;
    const tableBottom = pageH - 78;
    const maxRows = Math.max(1, slots.length);
    // Fit as many rows as possible on one page
    const available = tableBottom - y;
    const rowH = Math.min(42, Math.max(28, Math.floor(available / Math.max(maxRows, 1))));

    const rowsToDraw = slots.length
      ? slots.slice(0, Math.floor(available / Math.min(rowH, 28)))
      : [];

    if (!rowsToDraw.length) {
      doc.rect(marginX, y, contentW, 40).fill(BRAND.cream);
      doc.rect(marginX, y, contentW, 40).stroke(BRAND.line);
      write(doc, "No exam papers listed on the published timetable.", marginX + 12, y + 14, {
        size: 9,
        color: BRAND.inkMuted,
        width: contentW - 24,
      });
      y += 40;
    } else {
      rowsToDraw.forEach((slot, index) => {
        const rowY = y + index * rowH;
        if (index % 2 === 1) {
          doc.rect(marginX, rowY, contentW, rowH).fill(BRAND.rowAlt);
        }
        doc.rect(marginX, rowY, examColW, rowH).stroke(BRAND.line);
        doc.rect(marginX + examColW, rowY, signColW, rowH).stroke(BRAND.line);

        const title = safeText(slot.title, 48);
        const unitLine =
          slot.unit_code || slot.unit_name
            ? safeText(
                [slot.unit_code, slot.unit_name].filter(Boolean).join(" · "),
                52
              )
            : null;
        const when = `${formatDate(slot.starts_at)}  ·  ${formatTimeRange(slot.starts_at, slot.ends_at)}`;
        const venue = slot.venue ? `Venue: ${safeText(slot.venue, 36)}` : null;

        write(doc, title, marginX + 10, rowY + 5, {
          size: 9,
          bold: true,
          color: BRAND.navy,
          width: examColW - 18,
        });
        let detailY = rowY + 17;
        if (unitLine && rowH >= 34) {
          write(doc, unitLine, marginX + 10, detailY, {
            size: 7,
            color: BRAND.inkMuted,
            width: examColW - 18,
          });
          detailY += 11;
        }
        write(doc, when, marginX + 10, detailY, {
          size: 7.5,
          color: BRAND.greenDark,
          width: examColW - 18,
        });
        if (venue && rowH >= 40) {
          write(doc, venue, marginX + 10, detailY + 11, {
            size: 7,
            color: BRAND.inkMuted,
            width: examColW - 18,
          });
        }

        // Signature line
        const sigX = marginX + examColW + 14;
        const sigW = signColW - 28;
        const sigY = rowY + rowH / 2 + 4;
        doc
          .moveTo(sigX, sigY)
          .lineTo(sigX + sigW, sigY)
          .lineWidth(0.8)
          .stroke(BRAND.line);
        write(doc, "Sign", sigX, sigY + 3, {
          size: 6,
          color: BRAND.inkMuted,
          width: sigW,
        });
      });
      y += rowsToDraw.length * rowH;

      if (slots.length > rowsToDraw.length) {
        write(
          doc,
          `Showing ${rowsToDraw.length} of ${slots.length} papers on this card. See the full timetable PDF for the complete list.`,
          marginX,
          y + 6,
          { size: 7.5, color: BRAND.inkMuted, width: contentW }
        );
        y += 20;
      }
    }

    // Footer
    const footerY = pageH - 58;
    doc.rect(0, footerY, pageW, 58).fill(BRAND.greenDark);
    write(
      doc,
      "Present this card at every paper. An invigilator must sign after each exam. This card is invalid without a valid fee clearance.",
      marginX,
      footerY + 10,
      { size: 7.5, color: BRAND.cream, width: contentW }
    );
    write(
      doc,
      `Issued ${safeText(student.issued_on, 24)}  ·  ${BRAND.short} Academic Office`,
      marginX,
      footerY + 28,
      { size: 7, color: BRAND.gold, width: contentW / 2 }
    );
    write(doc, "STUDENT COPY", pageW - marginX - 100, footerY + 28, {
      size: 8,
      bold: true,
      color: BRAND.white,
      width: 100,
      align: "right",
    });

    doc.end();
  });
}

module.exports = {
  buildExamCardPdf,
};
