const PDFDocument = require("pdfkit");
const { DEFAULT_PRIMARY, DEFAULT_SECONDARY } = require("./schoolReportBranding");

const MARGIN = 48;
const PAGE_HEIGHT = 841.89;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - 44;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - 36;

const EMOJI_LABELS = {
  "👍": "Like",
  "👎": "Dislike",
  "👏": "Applause",
  "🙌": "Celebrate",
  "❤️": "Love",
  "😂": "Laugh",
  "😮": "Wow",
  "😢": "Sad",
  "😍": "Love",
  "🤔": "Thinking",
  "🎉": "Party",
  "🔥": "Fire",
  "💯": "100",
  "✅": "Yes",
  "❌": "No",
  "⭐": "Star",
  "💡": "Idea",
  "🙋": "Hand raised",
};

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtDateShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function humanizeKey(val) {
  if (!val) return "—";
  return String(val)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function reactionSummaryText(counts) {
  if (!counts || !Object.keys(counts).length) return "None";
  return Object.entries(counts)
    .map(([emoji, count]) => {
      const label = EMOJI_LABELS[emoji] || "Reaction";
      return `${label} (${count})`;
    })
    .join(", ");
}

function truncate(str, max = 42) {
  const s = String(str ?? "");
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Draw text at a fixed position without leaving fillColor/font state wrong.
 * Restores doc.y so flow layout is not disturbed.
 */
function textAt(doc, str, x, y, opts = {}) {
  const {
    color = "#334155",
    font = "Helvetica",
    size = 9,
    width,
    align,
    lineBreak = false,
  } = opts;
  const savedY = doc.y;
  doc.save();
  doc.font(font).fontSize(size).fillColor(color);
  const textOpts = { lineBreak };
  if (width != null) textOpts.width = width;
  if (align) textOpts.align = align;
  doc.text(String(str ?? ""), x, y, textOpts);
  doc.restore();
  doc.y = savedY;
}

function createPdfContext(brand) {
  const doc = new PDFDocument({
    margin: MARGIN,
    size: "A4",
    autoFirstPage: true,
    bufferPages: true,
  });
  let pageNum = 1;

  const stampFooters = () => {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.save();
      doc
        .moveTo(MARGIN, FOOTER_Y - 6)
        .lineTo(MARGIN + CONTENT_WIDTH, FOOTER_Y - 6)
        .lineWidth(0.5)
        .strokeColor("#e2e8f0")
        .stroke();
      textAt(doc, brand.name, MARGIN, FOOTER_Y, { color: "#94a3b8", size: 7, width: CONTENT_WIDTH / 2 });
      textAt(doc, `Page ${i + 1}`, MARGIN, FOOTER_Y, {
        color: "#94a3b8",
        size: 7,
        width: CONTENT_WIDTH,
        align: "right",
      });
      doc.restore();
    }
    if (range.count > 0) {
      doc.switchToPage(range.count - 1);
    }
  };

  const newPage = () => {
    doc.addPage();
    pageNum += 1;
    doc.x = MARGIN;
    doc.y = MARGIN;
  };

  const ensureSpace = (needed = 50) => {
    if (doc.y + needed > PAGE_BOTTOM) {
      newPage();
      return true;
    }
    return false;
  };

  return { doc, brand, stampFooters, newPage, ensureSpace, pageNum: () => pageNum };
}

function drawSectionTitle(ctx, title, primary) {
  const { doc, ensureSpace } = ctx;
  ensureSpace(36);
  const y0 = doc.y;
  textAt(doc, title.toUpperCase(), MARGIN, y0, {
    color: primary,
    font: "Helvetica-Bold",
    size: 12,
    width: CONTENT_WIDTH,
  });
  doc
    .moveTo(MARGIN, y0 + 14)
    .lineTo(MARGIN + CONTENT_WIDTH, y0 + 14)
    .lineWidth(2)
    .strokeColor(primary)
    .stroke();
  doc.y = y0 + 22;
}

function drawInfoGrid(ctx, rows) {
  const { doc, ensureSpace } = ctx;
  const colW = CONTENT_WIDTH / 2 - 8;
  for (let i = 0; i < rows.length; i += 2) {
    ensureSpace(44);
    const y0 = doc.y;
    const h = 38;
    for (let col = 0; col < 2; col++) {
      const item = rows[i + col];
      if (!item) continue;
      const x = MARGIN + col * (colW + 16);
      doc.roundedRect(x, y0, colW, h, 4).fillAndStroke("#f8fafc", "#e2e8f0");
      textAt(doc, item.label, x + 8, y0 + 6, { color: "#64748b", size: 8, width: colW - 16 });
      textAt(doc, truncate(item.value, 34), x + 8, y0 + 18, {
        color: "#0c2340",
        font: "Helvetica-Bold",
        size: 9,
        width: colW - 16,
      });
    }
    doc.y = y0 + h + 6;
  }
}

function drawStatCards(ctx, stats, primary, secondary) {
  const { doc, ensureSpace } = ctx;
  const cardW = (CONTENT_WIDTH - 24) / 4;
  const cardH = 46;
  ensureSpace(cardH + 8);
  const y0 = doc.y;
  stats.forEach((stat, i) => {
    const x = MARGIN + i * (cardW + 8);
    doc.roundedRect(x, y0, cardW, cardH, 4).fillAndStroke("#fffbeb", secondary);
    textAt(doc, String(stat.value), x + 6, y0 + 10, {
      color: primary,
      font: "Helvetica-Bold",
      size: 15,
      width: cardW - 12,
      align: "center",
    });
    textAt(doc, stat.label, x + 4, y0 + 30, {
      color: "#64748b",
      size: 7,
      width: cardW - 8,
      align: "center",
    });
  });
  doc.y = y0 + cardH + 10;
}

function drawTable(ctx, columns, tableRows, primary) {
  const { doc, ensureSpace, newPage } = ctx;
  const headerH = 18;
  const rowH = 16;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_WIDTH, headerH).fill(primary);
    let x = MARGIN + 4;
    columns.forEach((col) => {
      textAt(doc, col.label, x, y + 5, {
        color: "#ffffff",
        font: "Helvetica-Bold",
        size: 7,
        width: col.w - 6,
      });
      x += col.w;
    });
    doc.y = y + headerH;
  };

  if (!tableRows.length) {
    ensureSpace(28);
    textAt(doc, "No records.", MARGIN + 6, doc.y + 4, { color: "#64748b" });
    doc.y += 20;
    return;
  }

  ensureSpace(headerH + rowH + 8);
  drawHeader();

  tableRows.forEach((cells, rowIndex) => {
    if (doc.y + rowH > PAGE_BOTTOM) {
      newPage();
      drawHeader();
    }
    const y = doc.y;
    const rowBg = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).fill(rowBg);
    let x = MARGIN + 4;
    cells.forEach((cell, i) => {
      textAt(doc, truncate(cell, Math.max(8, Math.floor(columns[i].w / 5))), x, y + 4, {
        color: "#1e293b",
        size: 7,
        width: columns[i].w - 6,
      });
      x += columns[i].w;
    });
    doc.y = y + rowH;
  });
  doc.y += 4;
}

function drawChatBlock(ctx, message, primary) {
  const { doc, ensureSpace } = ctx;
  const who = message.author?.full_name || message.author?.username || "Participant";
  const role = message.author?.role ? humanizeKey(message.author.role) : "";
  const kind = message.is_question
    ? message.is_answered
      ? "Question (answered)"
      : "Question"
    : "Chat";
  const meta = [who, role, kind, fmtDateShort(message.sent_at)].filter(Boolean).join(" · ");
  const body = message.message || "";
  const replies = message.replies || [];

  doc.font("Helvetica").fontSize(9);
  const bodyH = doc.heightOfString(body, { width: CONTENT_WIDTH - 20 });
  const blockH = 24 + bodyH + replies.length * 13;

  ensureSpace(Math.min(blockH + 10, PAGE_BOTTOM - MARGIN));
  const y0 = doc.y;
  doc.roundedRect(MARGIN, y0, CONTENT_WIDTH, blockH, 4).fillAndStroke("#f8fafc", "#e2e8f0");
  textAt(doc, meta, MARGIN + 10, y0 + 5, {
    color: primary,
    font: "Helvetica-Bold",
    size: 8,
    width: CONTENT_WIDTH - 20,
  });

  const savedY = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor("#334155");
  doc.text(body, MARGIN + 10, y0 + 17, { width: CONTENT_WIDTH - 20 });
  doc.y = savedY;

  let ry = y0 + 17 + bodyH + 2;
  replies.forEach((r) => {
    const replyWho = r.author?.full_name || r.author?.username || "Staff";
    textAt(doc, `↳ ${replyWho}: ${r.message || ""}`, MARGIN + 14, ry, {
      color: "#475569",
      size: 8,
      width: CONTENT_WIDTH - 24,
    });
    ry += 13;
  });
  doc.y = y0 + blockH + 6;
}

function drawReportHeader(ctx, report) {
  const { doc, brand } = ctx;
  const primary = brand.primaryColor || DEFAULT_PRIMARY;
  const secondary = brand.secondaryColor || DEFAULT_SECONDARY;
  const ev = report.event;

  const yStart = doc.y;
  doc.rect(MARGIN, yStart, CONTENT_WIDTH, 4).fill(secondary);

  const logoSize = 50;
  const textY = yStart + 12;
  let textX = MARGIN;

  if (brand.logoPath) {
    try {
      doc.image(brand.logoPath, MARGIN, textY, { fit: [logoSize, logoSize] });
      textX = MARGIN + logoSize + 10;
    } catch {
      /* skip */
    }
  }

  textAt(doc, brand.name, textX, textY, {
    color: primary,
    font: "Helvetica-Bold",
    size: 17,
    width: CONTENT_WIDTH - (textX - MARGIN),
  });
  let lineY = textY + 20;
  if (brand.tagline) {
    textAt(doc, brand.tagline, textX, lineY, {
      color: "#64748b",
      font: "Helvetica-Oblique",
      size: 9,
      width: CONTENT_WIDTH - (textX - MARGIN),
    });
    lineY += 12;
  }
  const contact = [brand.phone, brand.email].filter(Boolean).join(" · ");
  if (contact) {
    textAt(doc, contact, textX, lineY, {
      color: "#64748b",
      size: 8,
      width: CONTENT_WIDTH - (textX - MARGIN),
    });
    lineY += 11;
  }

  const titleY = Math.max(lineY, textY + logoSize) + 8;
  doc.roundedRect(MARGIN, titleY, CONTENT_WIDTH, 62, 6).fill(primary);
  const reportLabel =
    String(ev.event_type || "").toLowerCase() === "staff_meeting"
      ? "STAFF MEETING REPORT"
      : "ONLINE EVENT REPORT";
  textAt(doc, reportLabel, MARGIN + 12, titleY + 10, {
    color: secondary,
    font: "Helvetica-Bold",
    size: 10,
    width: CONTENT_WIDTH - 24,
    align: "center",
  });
  textAt(doc, ev.title || "Event", MARGIN + 12, titleY + 24, {
    color: "#ffffff",
    font: "Helvetica-Bold",
    size: 14,
    width: CONTENT_WIDTH - 24,
    align: "center",
  });
  textAt(doc, `Generated ${fmtDate(report.generated_at)}`, MARGIN + 12, titleY + 44, {
    color: "#cbd5e1",
    size: 8,
    width: CONTENT_WIDTH - 24,
    align: "center",
  });

  doc.y = titleY + 70;
  return { primary, secondary };
}

function buildEventReportPdf(report, branding = {}) {
  const brand = {
    name: branding.name || "School",
    tagline: branding.tagline || null,
    email: branding.email || null,
    phone: branding.phone || null,
    logoPath: branding.logoPath || null,
    primaryColor: branding.primaryColor || DEFAULT_PRIMARY,
    secondaryColor: branding.secondaryColor || DEFAULT_SECONDARY,
  };

  return new Promise((resolve, reject) => {
    try {
      const ctx = createPdfContext(brand);
      const { doc, stampFooters } = ctx;
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const { primary, secondary } = drawReportHeader(ctx, report);
      const ev = report.event;
      const sum = report.summary;
      const attendees = report.attendees || [];
      const attendanceLog = report.attendance_log || [];
      const chat = report.chat || [];

      drawSectionTitle(ctx, "Event details", primary);
      drawInfoGrid(ctx, [
        { label: "Event type", value: humanizeKey(ev.event_type) },
        { label: "Delivery", value: humanizeKey(ev.delivery_mode) },
        { label: "Session status", value: humanizeKey(ev.session_status) },
        { label: "Start", value: fmtDate(ev.start_date) },
        { label: "End", value: fmtDate(ev.end_date) },
        { label: "Location", value: ev.location || "Online" },
        { label: "Reactions", value: reactionSummaryText(sum.reaction_counts) },
      ]);

      drawSectionTitle(ctx, "Session summary", primary);
      drawStatCards(
        ctx,
        [
          { label: "Unique participants", value: sum.unique_participants ?? 0 },
          { label: "Total minutes", value: sum.total_minutes_in_event ?? 0 },
          { label: "Avg minutes", value: sum.avg_minutes_in_event ?? 0 },
          { label: "Lobby visits", value: sum.total_lobby_requests ?? 0 },
        ],
        primary,
        secondary
      );

      drawSectionTitle(ctx, "Attendance summary", primary);
      textAt(doc, "Total minutes per person (sum of all join sessions).", MARGIN, doc.y, {
        color: "#64748b",
        size: 8,
        width: CONTENT_WIDTH,
      });
      doc.y += 12;

      drawTable(
        ctx,
        [
          { label: "Name", w: 108 },
          { label: "Role", w: 48 },
          { label: "Visits", w: 36 },
          { label: "Total min", w: 48 },
          { label: "First in", w: 82 },
          { label: "Last out", w: 82 },
        ],
        attendees.map((a) => [
          a.user?.full_name || a.user?.username || "—",
          humanizeKey(a.user?.role),
          String(a.visit_count ?? 1),
          a.minutes_in_event != null ? String(a.minutes_in_event) : "—",
          fmtDateShort(a.admitted_at),
          fmtDateShort(a.left_at),
        ]),
        primary
      );

      if (attendanceLog.length > 0) {
        drawSectionTitle(ctx, "Attendance log", primary);
        drawTable(
          ctx,
          [
            { label: "#", w: 24 },
            { label: "Name", w: 92 },
            { label: "Role", w: 42 },
            { label: "Status", w: 46 },
            { label: "Admitted", w: 76 },
            { label: "Left", w: 76 },
            { label: "Min", w: 30 },
          ],
          attendanceLog.map((v) => [
            String(v.visit_number ?? "—"),
            v.user?.full_name || v.user?.username || "—",
            humanizeKey(v.user?.role),
            humanizeKey(v.status),
            fmtDateShort(v.admitted_at),
            fmtDateShort(v.left_at),
            v.minutes_in_event != null ? String(v.minutes_in_event) : "—",
          ]),
          primary
        );
      }

      if (chat.length > 0) {
        drawSectionTitle(ctx, "Chat & questions", primary);
        chat.forEach((m) => drawChatBlock(ctx, m, primary));
      }

      stampFooters();
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { buildEventReportPdf };
