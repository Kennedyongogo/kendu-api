const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  short: "KASMS",
  tagline: "Train where care meets calling",
  green: "#006050",
  greenDark: "#004840",
  navy: "#1e2858",
  gold: "#c8a840",
  cream: "#f7f4ef",
  inkMuted: "#5a6478",
  white: "#ffffff",
};

const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "school_public", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-public", "public", "images", "logo.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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

function fixedText(doc, text, x, y, width, options = {}) {
  const {
    height = 14,
    font = "Helvetica",
    size = 9,
    color = BRAND.navy,
    align = "left",
    bold = false,
  } = options;
  doc.font(bold ? `${font}-Bold` : font).fontSize(size).fillColor(color);
  doc.text(String(text ?? "-"), x, y, {
    width,
    height,
    align,
    ellipsis: true,
    lineBreak: false,
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

function formatPeriodRange(start, end) {
  if (!start && !end) return null;
  const fmt = (d) =>
    new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} - ${fmt(end)}`;
  return start ? fmt(start) : fmt(end);
}

function slotDateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString("en-KE", { weekday: "short" }),
    day: d.getDate(),
    month: d.toLocaleDateString("en-KE", { month: "short" }).toUpperCase(),
  };
}

function pageContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawPageHeader(doc, period) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const top = doc.page.margins.top;
  const logoPath = resolveLogoPath();

  if (logoPath) {
    try {
      doc.image(logoPath, left, top, { height: 44 });
    } catch {
      /* ignore */
    }
  }

  const textX = logoPath ? left + 52 : left;
  fixedText(doc, BRAND.name, textX, top + 2, width - 150, {
    height: 16,
    size: 11,
    bold: true,
    color: BRAND.navy,
  });
  fixedText(doc, BRAND.tagline, textX, top + 18, width - 150, {
    height: 12,
    size: 8,
    color: BRAND.inkMuted,
  });

  const status = STATUS_LABELS[period.status] || period.status || "Draft";
  doc.roundedRect(right - 120, top, 120, 36, 6).fillAndStroke("#f4faf8", BRAND.green);
  fixedText(doc, "STATUS", right - 112, top + 6, 104, {
    height: 10,
    size: 7,
    bold: true,
    color: BRAND.greenDark,
    align: "center",
  });
  fixedText(doc, status.toUpperCase(), right - 112, top + 18, 104, {
    height: 12,
    size: 8.5,
    bold: true,
    align: "center",
  });

  const bandY = top + 54;
  doc.roundedRect(left, bandY, width, 30, 6).fill(BRAND.green);
  fixedText(doc, "OFFICIAL EXAM TIMETABLE", left, bandY + 9, width, {
    height: 14,
    size: 12,
    bold: true,
    color: BRAND.white,
    align: "center",
  });

  return bandY + 42;
}

function drawPlanSummary(doc, y, period) {
  const left = doc.page.margins.left;
  const width = pageContentWidth(doc);

  doc.roundedRect(left, y, width, 88, 10).fillAndStroke(BRAND.cream, "#d7e3df");

  fixedText(doc, safeText(period.programme_name, 80), left + 14, y + 12, width - 28, {
    height: 12,
    size: 8,
    bold: true,
    color: BRAND.green,
  });
  fixedText(doc, safeText(period.title, 160), left + 14, y + 26, width - 28, {
    height: 22,
    size: 14,
    bold: true,
    color: BRAND.navy,
  });

  const cohort = `Year ${period.year_of_study}  |  Semester ${period.semester}  |  ${period.academic_year}`;
  fixedText(doc, cohort, left + 14, y + 50, width - 28, {
    height: 12,
    size: 9,
    color: BRAND.inkMuted,
  });

  const periodLabel = formatPeriodRange(period.period_start, period.period_end);
  if (periodLabel) {
    fixedText(doc, `Exam period: ${periodLabel}`, left + 14, y + 66, width - 28, {
      height: 12,
      size: 8.5,
      bold: true,
      color: BRAND.greenDark,
    });
  }

  return y + 100;
}

function drawSlotCard(doc, x, y, width, slot, index) {
  const cardH = 56;
  const sigW = 118;
  const sigGap = 10;
  const contentW = width - sigW - sigGap - 8;

  doc.roundedRect(x, y, width, cardH, 8).fillAndStroke("#f7faf8", "#d7e3df");

  const parts = slotDateParts(slot.starts_at);
  const dateW = 46;
  if (parts) {
    const bx = x + 8;
    const by = y + 7;
    const bh = cardH - 14;
    const br = 6;
    const headerH = 14;

    doc.save();
    doc.roundedRect(bx, by, dateW, bh, br).clip();
    doc.rect(bx, by, dateW, bh).fill(BRAND.white);
    doc.rect(bx, by, dateW, headerH).fill(BRAND.green);
    doc.restore();

    doc.roundedRect(bx, by, dateW, bh, br).lineWidth(0.75).strokeColor("#c5d9d3").stroke();

    fixedText(doc, parts.month, bx, by + 2.5, dateW, {
      height: 10,
      size: 6.5,
      bold: true,
      color: BRAND.white,
      align: "center",
    });
    fixedText(doc, String(parts.day), bx, by + 16, dateW, {
      height: 15,
      size: 12.5,
      bold: true,
      color: BRAND.navy,
      align: "center",
    });
    fixedText(doc, parts.weekday, bx, by + 32, dateW, {
      height: 10,
      size: 6,
      color: BRAND.inkMuted,
      align: "center",
    });
  }

  const textX = x + (parts ? 62 : 12);
  const textW = contentW - (parts ? 62 : 12);
  fixedText(doc, `${index + 1}. ${safeText(slot.title, 100)}`, textX, y + 9, textW, {
    height: 13,
    size: 9,
    bold: true,
    color: BRAND.navy,
  });
  fixedText(doc, formatDate(slot.starts_at), textX, y + 23, textW * 0.55, {
    height: 11,
    size: 7.5,
    color: BRAND.inkMuted,
  });
  fixedText(doc, formatTimeRange(slot.starts_at, slot.ends_at), textX + textW * 0.55, y + 23, textW * 0.45, {
    height: 11,
    size: 7.5,
    bold: true,
    color: BRAND.greenDark,
    align: "right",
  });
  if (slot.venue) {
    fixedText(doc, safeText(slot.venue, 70), textX, y + 36, textW, {
      height: 11,
      size: 7.5,
      color: BRAND.inkMuted,
    });
  }

  // Signature box on the far right
  const sigX = x + width - sigW - 8;
  const sigY = y + 8;
  const sigH = cardH - 16;
  doc.roundedRect(sigX, sigY, sigW, sigH, 6).fillAndStroke(BRAND.white, "#c5d9d3");
  fixedText(doc, "INVIGILATOR SIGNATURE", sigX + 4, sigY + 4, sigW - 8, {
    height: 9,
    size: 5.5,
    bold: true,
    color: BRAND.inkMuted,
    align: "center",
  });
  doc
    .moveTo(sigX + 10, sigY + sigH - 14)
    .lineTo(sigX + sigW - 10, sigY + sigH - 14)
    .lineWidth(0.7)
    .strokeColor("#c5d9d3")
    .stroke();
  fixedText(doc, "Sign / stamp", sigX + 4, sigY + sigH - 11, sigW - 8, {
    height: 8,
    size: 5.5,
    color: "#9aa3b5",
    align: "center",
  });

  return cardH + 7;
}

function drawFooter(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 28;

  doc
    .moveTo(left, bottom)
    .lineTo(right, bottom)
    .lineWidth(0.8)
    .strokeColor("#d7e3df")
    .stroke();

  fixedText(
    doc,
    `${BRAND.short} - Official exam timetable. Verify dates and venues before publication.`,
    left,
    bottom + 8,
    right - left,
    { height: 10, size: 7, color: BRAND.inkMuted, align: "center" }
  );
  fixedText(
    doc,
    `Generated ${new Date().toLocaleString("en-KE")}`,
    left,
    bottom + 18,
    right - left,
    { height: 10, size: 6.5, color: "#8a93a8", align: "center" }
  );
}

/**
 * @param {object} period — serialized exam period with slots[]
 * @returns {Promise<Buffer>}
 */
async function generateExamTimetablePdf(period) {
  const slots = Array.isArray(period.slots) ? [...period.slots] : [];
  slots.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Exam Timetable - ${safeText(period.title, 80)}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = drawPageHeader(doc, period);
    y = drawPlanSummary(doc, y, period);

    const left = doc.page.margins.left;
    const width = pageContentWidth(doc);
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 48;

    fixedText(doc, `EXAM SCHEDULE (${slots.length} paper${slots.length === 1 ? "" : "s"})`, left, y, width, {
      height: 12,
      size: 8.5,
      bold: true,
      color: BRAND.greenDark,
    });
    y += 16;

    if (!slots.length) {
      doc.roundedRect(left, y, width, 48, 8).dash(3, { space: 3 }).stroke("#c5d9d3");
      fixedText(doc, "No exam papers scheduled yet.", left, y + 18, width, {
        height: 12,
        size: 9,
        color: BRAND.inkMuted,
        align: "center",
      });
      doc.undash();
    } else {
      slots.forEach((slot, index) => {
        const step = 63;
        if (y + step > bottomLimit) {
          drawFooter(doc);
          doc.addPage();
          y = drawPageHeader(doc, period);
          y += 8;
        }
        y += drawSlotCard(doc, left, y, width, slot, index);
      });
    }

    drawFooter(doc);
    doc.end();
  });
}

module.exports = {
  generateExamTimetablePdf,
};
