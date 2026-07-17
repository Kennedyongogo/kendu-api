const PDFDocument = require("pdfkit");
const { loadSchoolReportBranding } = require("./schoolReportBranding");

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - 52;
const ROW_H = 22;
const ACCENT_FALLBACK = "#DC2626";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  });
}

function fmtTime(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function lessonTimeRange(lesson) {
  if (!lesson) return "—";
  const start = fmtTime(lesson.starts_at);
  const end = fmtTime(lesson.ends_at);
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "present") return "Present";
  if (s === "late") return "Late";
  if (s === "absent") return "Absent";
  return "Unmarked";
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "present") return "#15803d";
  if (s === "late") return "#b45309";
  if (s === "absent") return "#b91c1c";
  return "#64748b";
}

function truncate(str, max = 36) {
  const t = String(str ?? "");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function safeFilenamePart(str) {
  return String(str || "lesson")
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * @param {object} data Register payload (formatRegisterResponse shape)
 * @returns {Promise<Buffer>}
 */
async function buildLessonAttendanceRegisterPdf(data) {
  const brand = await loadSchoolReportBranding();
  const primary = brand.primaryColor || ACCENT_FALLBACK;
  const accent = ACCENT_FALLBACK;

  const entries = Array.isArray(data.entries) ? data.entries : [];
  let present = 0;
  let late = 0;
  let absent = 0;
  let unmarked = 0;
  for (const e of entries) {
    const s = String(e.status || "").toLowerCase();
    if (s === "present") present += 1;
    else if (s === "late") late += 1;
    else if (s === "absent") absent += 1;
    else unmarked += 1;
  }

  const subjectName = data.lesson?.subject?.name || "Lesson";
  const classLabel = data.curriculum_class?.label || data.curriculum_class?.name || "—";
  const lessonDate = data.lesson?.lesson_date || "—";
  const hostName = data.host_name || "—";
  const registerStatus = data.status === "finalized" ? "Finalized" : "Draft";
  const deliveryMode =
    data.lesson?.delivery_mode === "online" ? "Online lesson" : "Physical lesson";

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true, bufferPages: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      let y = MARGIN;

      if (brand.logoPath) {
        try {
          doc.image(brand.logoPath, MARGIN, y, { fit: [44, 44] });
        } catch (_) {
          /* skip */
        }
      }

      doc.font("Helvetica-Bold").fontSize(14).fillColor(primary);
      doc.text(brand.name, MARGIN + 52, y + 2, { width: CONTENT_WIDTH - 52, lineBreak: false });
      if (brand.tagline) {
        doc.font("Helvetica").fontSize(8).fillColor("#64748b");
        doc.text(brand.tagline, MARGIN + 52, y + 18, { width: CONTENT_WIDTH - 52, lineBreak: false });
      }
      y += 50;

      doc.rect(MARGIN, y, CONTENT_WIDTH, 4).fill(accent);
      y += 14;

      doc.font("Helvetica-Bold").fontSize(16).fillColor("#1C1917");
      doc.text("Class Attendance Register", MARGIN, y, { lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(data.status === "finalized" ? "#15803d" : "#b45309");
      doc.text(registerStatus.toUpperCase(), MARGIN, y, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
      y += 22;

      doc.font("Helvetica").fontSize(9).fillColor("#64748b");
      doc.text("Official lesson register · one record per timetable lesson", MARGIN, y, { lineBreak: false });
      y += 18;

      const metaH = 78;
      doc.fillColor("#FFFBF7").rect(MARGIN, y, CONTENT_WIDTH, metaH).fill();
      doc.strokeColor("#FECACA").rect(MARGIN, y, CONTENT_WIDTH, metaH).stroke();

      const colW = CONTENT_WIDTH / 2 - 16;
      const mx = MARGIN + 12;
      const my = y + 10;
      const metaRows = [
        ["Subject", subjectName],
        ["Class", classLabel],
        ["Lesson date", fmtDate(lessonDate)],
        ["Lesson time", lessonTimeRange(data.lesson)],
        ["Delivery", deliveryMode],
        ["Host / teacher", hostName],
      ];
      metaRows.forEach(([label, value], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = mx + col * (colW + 16);
        const ry = my + row * 22;
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#94a3b8");
        doc.text(label.toUpperCase(), x, ry, { width: colW, lineBreak: false });
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#1C1917");
        doc.text(truncate(value, 42), x, ry + 9, { width: colW, lineBreak: false });
      });
      y += metaH + 14;

      const summaryH = 36;
      doc.fillColor("#FEE2E2").rect(MARGIN, y, CONTENT_WIDTH, summaryH).fill();
      doc.strokeColor("#FECACA").rect(MARGIN, y, CONTENT_WIDTH, summaryH).stroke();
      const stats = [
        { label: "Present", value: present, color: "#15803d" },
        { label: "Late", value: late, color: "#b45309" },
        { label: "Absent", value: absent, color: "#b91c1c" },
        { label: "Unmarked", value: unmarked, color: "#64748b" },
        { label: "Total", value: entries.length, color: primary },
      ];
      const statW = CONTENT_WIDTH / stats.length;
      stats.forEach((st, i) => {
        const sx = MARGIN + i * statW;
        doc.font("Helvetica-Bold").fontSize(14).fillColor(st.color);
        doc.text(String(st.value), sx, y + 8, { width: statW, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(7).fillColor("#7F1D1D");
        doc.text(st.label.toUpperCase(), sx, y + 24, { width: statW, align: "center", lineBreak: false });
      });
      y += summaryH + 16;

      const cols = [
        { label: "#", w: 28, align: "left" },
        { label: "Student", w: 168, align: "left" },
        { label: "Admission", w: 72, align: "left" },
        { label: "Status", w: 72, align: "left" },
        { label: "Portal", w: 52, align: "center" },
        { label: "Marked at", w: CONTENT_WIDTH - 28 - 168 - 72 - 72 - 52, align: "left" },
      ];

      const drawTableHeader = () => {
        doc.fillColor("#7F1D1D").rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();
        let cx = MARGIN + 6;
        cols.forEach((col) => {
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff");
          doc.text(col.label, cx, y + 7, { width: col.w - 4, align: col.align, lineBreak: false });
          cx += col.w;
        });
        y += ROW_H;
      };

      const ensureSpace = (needed) => {
        if (y + needed > PAGE_BOTTOM) {
          doc.addPage();
          y = MARGIN;
          drawTableHeader();
        }
      };

      drawTableHeader();

      entries.forEach((entry, idx) => {
        ensureSpace(ROW_H);
        const bg = idx % 2 === 0 ? "#ffffff" : "#FFF7ED";
        doc.fillColor(bg).rect(MARGIN, y, CONTENT_WIDTH, ROW_H).fill();
        doc.strokeColor("#f1f5f9").moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_WIDTH, y + ROW_H).stroke();

        const studentName =
          entry.student?.user?.full_name || entry.student?.user?.username || "—";
        const admission = entry.student?.admission_number || "—";
        const mark = statusLabel(entry.status);
        const portal = entry.portal_joined ? "Yes" : "—";
        const markedAt = entry.marked_at ? fmtDateTime(entry.marked_at) : "—";

        let cx = MARGIN + 6;
        const cells = [
          { text: String(idx + 1), w: cols[0].w, align: "left", color: "#64748b", font: "Helvetica" },
          { text: truncate(studentName, 32), w: cols[1].w, align: "left", color: "#1C1917", font: "Helvetica-Bold" },
          { text: admission, w: cols[2].w, align: "left", color: "#334155", font: "Helvetica" },
          { text: mark, w: cols[3].w, align: "left", color: statusColor(entry.status), font: "Helvetica-Bold" },
          { text: portal, w: cols[4].w, align: "center", color: entry.portal_joined ? "#0369a1" : "#94a3b8", font: "Helvetica" },
          { text: markedAt, w: cols[5].w, align: "left", color: "#64748b", font: "Helvetica", size: 7 },
        ];

        cells.forEach((cell) => {
          doc.font(cell.font).fontSize(cell.size || 8).fillColor(cell.color);
          doc.text(cell.text, cx, y + 7, { width: cell.w - 4, align: cell.align, lineBreak: false });
          cx += cell.w;
        });
        y += ROW_H;
      });

      if (!entries.length) {
        ensureSpace(40);
        doc.font("Helvetica").fontSize(9).fillColor("#64748b");
        doc.text("No students on this class roster.", MARGIN + 8, y + 10, { width: CONTENT_WIDTH - 16 });
        y += 40;
      }

      y += 20;
      ensureSpace(70);
      if (data.notes) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(primary);
        doc.text("Notes", MARGIN, y, { lineBreak: false });
        y += 12;
        doc.font("Helvetica").fontSize(8).fillColor("#475569");
        doc.text(String(data.notes).slice(0, 500), MARGIN, y, { width: CONTENT_WIDTH });
        y += 28;
      }

      ensureSpace(56);
      const sigY = y + 8;
      doc.strokeColor("#cbd5e1").lineWidth(0.75);
      doc.moveTo(MARGIN, sigY + 28).lineTo(MARGIN + 200, sigY + 28).stroke();
      doc.moveTo(MARGIN + CONTENT_WIDTH - 200, sigY + 28).lineTo(MARGIN + CONTENT_WIDTH, sigY + 28).stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#64748b");
      doc.text("Teacher / host signature", MARGIN, sigY + 32, { width: 200, lineBreak: false });
      doc.text("Date", MARGIN + CONTENT_WIDTH - 200, sigY + 32, { width: 200, align: "right", lineBreak: false });
      if (data.status === "finalized" && data.finalized_at) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#15803d");
        doc.text(
          `Finalized ${fmtDateTime(data.finalized_at)}${data.finalized_by_name ? ` · ${data.finalized_by_name}` : ""}`,
          MARGIN,
          sigY + 46,
          { width: CONTENT_WIDTH, align: "right", lineBreak: false }
        );
      }
      y = sigY + 58;

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(i);
        const fy = PAGE_HEIGHT - 32;
        doc.moveTo(MARGIN, fy - 8).lineTo(MARGIN + CONTENT_WIDTH, fy - 8).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
        doc.font("Helvetica").fontSize(7).fillColor("#94a3b8");
        doc.text(brand.name, MARGIN, fy, { width: CONTENT_WIDTH / 2, lineBreak: false });
        doc.text(
          `Generated ${fmtDateTime(new Date())} · Page ${i + 1} of ${range.count}`,
          MARGIN,
          fy,
          { width: CONTENT_WIDTH, align: "right", lineBreak: false }
        );
        doc.text(
          "Portal joined is indicative only; official attendance is the mark recorded above.",
          MARGIN,
          fy + 10,
          { width: CONTENT_WIDTH, align: "center", lineBreak: false }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function attendanceRegisterPdfFilename(data) {
  const subject = safeFilenamePart(data.lesson?.subject?.name || "lesson");
  const date = safeFilenamePart(data.lesson?.lesson_date || "");
  return `attendance-register-${subject}${date ? `-${date}` : ""}.pdf`;
}

module.exports = { buildLessonAttendanceRegisterPdf, attendanceRegisterPdfFilename };
