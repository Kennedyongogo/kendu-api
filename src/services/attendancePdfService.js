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
  present: "#2e7d32",
  presentBg: "#e8f5e9",
  absent: "#c62828",
  absentBg: "#fdecec",
  rule: "#d7e3df",
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
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
  const { height = 14, size = 9, color = BRAND.navy, align = "left", bold = false } = options;
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
  doc.text(String(text ?? "-"), x, y, { width, height, align, ellipsis: true, lineBreak: false });
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

function timeLabel(session) {
  const start = formatTime(session.start_time);
  const end = formatTime(session.end_time);
  if (start && end) return `${start} - ${end}`;
  return start || "-";
}

function drawPageHeader(doc, session) {
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
  fixedText(doc, BRAND.name, textX, top + 4, width - 190, { height: 16, size: 11, bold: true });
  fixedText(doc, BRAND.tagline, textX, top + 20, width - 190, { height: 12, size: 8, color: BRAND.inkMuted });

  doc.roundedRect(right - 132, top, 132, 40, 6).fillAndStroke("#f4faf8", BRAND.green);
  fixedText(doc, "CLASS DATE", right - 126, top + 6, 120, {
    height: 10,
    size: 7,
    bold: true,
    color: BRAND.greenDark,
    align: "center",
  });
  const d = new Date(`${session.session_date}T00:00:00Z`);
  const shortDate = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  fixedText(doc, shortDate.toUpperCase(), right - 126, top + 19, 120, {
    height: 14,
    size: 10,
    bold: true,
    align: "center",
  });

  const bandY = top + 54;
  doc.roundedRect(left, bandY, width, 30, 6).fill(BRAND.navy);
  doc.rect(left, bandY + 27, width, 3).fill(BRAND.gold);
  fixedText(doc, "CLASS ATTENDANCE REGISTER", left, bandY + 9, width, {
    height: 14,
    size: 12,
    bold: true,
    color: BRAND.white,
    align: "center",
  });

  return bandY + 42;
}

function drawSummary(doc, y, session) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxH = 104;
  const statsW = 180;
  const infoW = width - statsW - 28;

  doc.roundedRect(left, y, width, boxH, 10).fillAndStroke(BRAND.cream, BRAND.rule);

  fixedText(doc, safeText(session.programme_name, 90).toUpperCase(), left + 14, y + 12, infoW, {
    height: 12,
    size: 8,
    bold: true,
    color: BRAND.green,
  });
  fixedText(doc, safeText(session.unit_name || "Class session", 90), left + 14, y + 26, infoW, {
    height: 20,
    size: 14,
    bold: true,
  });
  fixedText(doc, `Year ${session.year_of_study}  |  Semester ${session.semester}`, left + 14, y + 48, infoW, {
    height: 12,
    size: 9,
    color: BRAND.inkMuted,
  });
  fixedText(doc, `${formatDate(session.session_date)}  |  ${timeLabel(session)}`, left + 14, y + 63, infoW, {
    height: 12,
    size: 9,
    bold: true,
    color: BRAND.greenDark,
  });
  fixedText(doc, `Taken by: ${safeText(session.taken_by?.full_name || "-", 60)}`, left + 14, y + 80, infoW, {
    height: 12,
    size: 8.5,
    color: BRAND.inkMuted,
  });

  const total = session.total_count || 0;
  const rate = total ? Math.round((session.present_count / total) * 100) : 0;
  const stats = [
    { label: "PRESENT", value: session.present_count, color: BRAND.present, bg: BRAND.presentBg },
    { label: "ABSENT", value: session.absent_count, color: BRAND.absent, bg: BRAND.absentBg },
    { label: "RATE", value: `${rate}%`, color: BRAND.navy, bg: BRAND.white },
  ];
  const cellW = (statsW - 12) / 3;
  const statsX = left + width - statsW - 12;
  stats.forEach((stat, i) => {
    const x = statsX + i * (cellW + 6);
    doc.roundedRect(x, y + 22, cellW, 60, 8).fillAndStroke(stat.bg, BRAND.rule);
    fixedText(doc, String(stat.value), x, y + 34, cellW, {
      height: 20,
      size: 17,
      bold: true,
      color: stat.color,
      align: "center",
    });
    fixedText(doc, stat.label, x, y + 60, cellW, {
      height: 10,
      size: 6.5,
      bold: true,
      color: BRAND.inkMuted,
      align: "center",
    });
  });

  return y + boxH + 16;
}

const COLS = (left, width) => {
  const num = { x: left, w: 30 };
  const adm = { x: left + 30, w: 110 };
  const status = { x: left + width - 96, w: 96 };
  const name = { x: adm.x + adm.w, w: status.x - (adm.x + adm.w) };
  return { num, adm, name, status };
};

function drawTableHead(doc, y, left, width) {
  const cols = COLS(left, width);
  doc.roundedRect(left, y, width, 22, 5).fill(BRAND.navy);
  const opts = { height: 10, size: 7.5, bold: true, color: BRAND.white };
  fixedText(doc, "#", cols.num.x + 8, y + 7, cols.num.w - 8, opts);
  fixedText(doc, "ADMISSION NO.", cols.adm.x + 6, y + 7, cols.adm.w - 6, opts);
  fixedText(doc, "STUDENT NAME", cols.name.x + 6, y + 7, cols.name.w - 6, opts);
  fixedText(doc, "STATUS", cols.status.x, y + 7, cols.status.w, { ...opts, align: "center" });
  return y + 22;
}

function drawRow(doc, y, left, width, record, index) {
  const rowH = 22;
  const cols = COLS(left, width);
  if (index % 2 === 1) doc.rect(left, y, width, rowH).fill("#f7f9fb");
  doc
    .moveTo(left, y + rowH)
    .lineTo(left + width, y + rowH)
    .lineWidth(0.5)
    .strokeColor("#e3e8ef")
    .stroke();

  fixedText(doc, String(index + 1), cols.num.x + 8, y + 7, cols.num.w - 8, { size: 8.5, color: BRAND.inkMuted });
  fixedText(doc, safeText(record.admission_number || "-", 24), cols.adm.x + 6, y + 7, cols.adm.w - 6, {
    size: 8.5,
    color: BRAND.inkMuted,
  });
  fixedText(doc, safeText(record.full_name, 70), cols.name.x + 6, y + 7, cols.name.w - 10, {
    size: 9,
    bold: true,
  });

  const present = record.status === "present";
  const pillW = 70;
  const pillX = cols.status.x + (cols.status.w - pillW) / 2;
  doc.roundedRect(pillX, y + 4, pillW, 14, 7).fill(present ? BRAND.presentBg : BRAND.absentBg);
  fixedText(doc, present ? "PRESENT" : "ABSENT", pillX, y + 7.5, pillW, {
    height: 10,
    size: 7,
    bold: true,
    color: present ? BRAND.present : BRAND.absent,
    align: "center",
  });

  return y + rowH;
}

function drawSignOff(doc, y, session) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = (width - 24) / 3;
  const labels = [
    { title: "LECTURER", value: safeText(session.taken_by?.full_name || "", 40) },
    { title: "SIGNATURE", value: "" },
    { title: "DATE", value: "" },
  ];
  labels.forEach((item, i) => {
    const x = left + i * (colW + 12);
    fixedText(doc, item.value === "-" ? "" : item.value, x, y + 6, colW, { height: 12, size: 9, bold: true });
    doc
      .moveTo(x, y + 22)
      .lineTo(x + colW, y + 22)
      .lineWidth(0.8)
      .strokeColor("#9aa3b5")
      .stroke();
    fixedText(doc, item.title, x, y + 27, colW, { height: 10, size: 7, bold: true, color: BRAND.inkMuted });
  });
  return y + 44;
}

function drawFooter(doc, pageNumber, pageCount) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 28;

  doc.moveTo(left, bottom).lineTo(right, bottom).lineWidth(0.8).strokeColor(BRAND.rule).stroke();
  fixedText(
    doc,
    `${BRAND.short} - Official class attendance register`,
    left,
    bottom + 8,
    (right - left) / 2,
    { height: 10, size: 7, color: BRAND.inkMuted }
  );
  fixedText(doc, `Page ${pageNumber} of ${pageCount}`, left + (right - left) / 2, bottom + 8, (right - left) / 2, {
    height: 10,
    size: 7,
    bold: true,
    color: BRAND.inkMuted,
    align: "right",
  });
  fixedText(doc, `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}`, left, bottom + 18, right - left, {
    height: 10,
    size: 6.5,
    color: "#8a93a8",
  });
}

/**
 * @param {object} session serialized attendance session with records[]
 * @returns {Promise<Buffer>}
 */
async function generateAttendancePdf(session) {
  const records = Array.isArray(session.records) ? session.records : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      bufferPages: true,
      info: {
        Title: `Attendance - ${safeText(session.programme_name, 60)} - ${session.session_date}`,
        Author: BRAND.short,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 44;

    let y = drawPageHeader(doc, session);
    y = drawSummary(doc, y, session);

    fixedText(doc, `STUDENTS (${records.length})`, left, y, width, {
      height: 12,
      size: 8.5,
      bold: true,
      color: BRAND.greenDark,
    });
    y += 16;
    y = drawTableHead(doc, y, left, width);

    records.forEach((record, index) => {
      if (y + 22 > bottomLimit) {
        doc.addPage();
        y = drawPageHeader(doc, session);
        y = drawTableHead(doc, y, left, width);
      }
      y = drawRow(doc, y, left, width, record, index);
    });

    if (session.notes) {
      const notes = safeText(session.notes, 600);
      doc.font("Helvetica").fontSize(8.5);
      const notesH = doc.heightOfString(notes, { width: width - 28 }) + 30;
      if (y + 16 + notesH > bottomLimit) {
        doc.addPage();
        y = drawPageHeader(doc, session);
      }
      y += 16;
      doc.roundedRect(left, y, width, notesH, 8).fillAndStroke(BRAND.cream, BRAND.rule);
      fixedText(doc, "NOTES", left + 14, y + 10, width - 28, { height: 10, size: 7, bold: true, color: BRAND.green });
      doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.navy);
      doc.text(notes, left + 14, y + 22, { width: width - 28 });
      y += notesH;
    }

    if (y + 70 > bottomLimit) {
      doc.addPage();
      y = drawPageHeader(doc, session);
    }
    drawSignOff(doc, y + 26, session);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = { generateAttendancePdf };
