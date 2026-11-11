const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BRAND = {
  name: "Kendu Adventist School of Medical Sciences",
  short: "KASMS",
  blue: "#1B5EA8",
  navy: "#1e2858",
  gold: "#c8a840",
  muted: "#5a6478",
  soft: "#F4F7FB",
  line: "#D7E2F0",
  cream: "#FFF9EF",
};

const SECTION_META = {
  full: { title: "School operations summary report" },
  admissions_status: {
    title: "Admissions status report",
    chart: "admissions_by_status",
    type: "map",
  },
  admissions_programme: {
    title: "Admissions by programme report",
    chart: "admissions_by_programme",
    type: "series",
  },
  students_programme: {
    title: "Students by programme report",
    chart: "students_by_programme",
    type: "series",
  },
  students_boarding: {
    title: "Student boarding report",
    chart: "students_by_boarding",
    type: "map",
  },
  students_gender: {
    title: "Student gender report",
    chart: "students_by_gender",
    type: "map",
  },
  registrations_status: {
    title: "Unit registration report",
    chart: "registrations_by_status",
    type: "map",
  },
  exam_status: {
    title: "Exam periods report",
    chart: "exam_periods_by_status",
    type: "map",
  },
  library_loans: {
    title: "Library loans report",
    chart: "library_loans_by_status",
    type: "map",
  },
  office_roles: {
    title: "Office staffing report",
    chart: "office_roles",
    type: "roles",
  },
};

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-admin", "public", "images", "logo.png"),
    path.join(__dirname, "..", "..", "..", "kendu-public", "public", "images", "logo.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function formatRole(role) {
  return String(role || "dashboard")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyKey(key) {
  return String(key || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function n(value) {
  return Number(value) || 0;
}

/** Draw text in a fixed box so PDFKit never auto-paginates mid-layout. */
function fixedText(doc, text, x, y, width, options = {}) {
  const {
    height = 12,
    font = "Helvetica",
    size = 9,
    color = BRAND.navy,
    align = "left",
    bold = false,
  } = options;
  doc.font(bold ? `${font}-Bold` : font).fontSize(size).fillColor(color);
  doc.text(String(text ?? "—"), x, y, {
    width,
    height,
    align,
    ellipsis: true,
    lineBreak: false,
  });
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bottomLimit(doc) {
  return doc.page.height - doc.page.margins.bottom - 28;
}

function filterLines(payload) {
  const lines = [];
  const programmeId = payload?.filters?.programme_id;
  if (programmeId) {
    const name =
      payload?.filter_options?.programmes?.find((p) => p.id === programmeId)?.name || programmeId;
    lines.push(`Programme filter: ${name}`);
  } else {
    lines.push("Programme filter: All programmes");
  }
  const deps = payload?.filter_options?.departments || [];
  if (deps.length) {
    lines.push(`Department scope: ${deps.map((d) => d.name).join(", ")}`);
  }
  if (payload?.filters?.academic_year) {
    lines.push(`Academic year: ${payload.filters.academic_year}`);
  }
  return lines;
}

function kpiRowsForRole(payload) {
  const s = payload.school || {};
  const role = payload.role || "admin";
  const common = [
    ["Students", n(s.students)],
    ["Active students", n(s.students_active)],
    ["Programmes", n(s.programmes)],
    ["Admissions", n(s.admissions_total)],
  ];

  const byRole = {
    admin: [
      ["Total users", n(s.total_users)],
      ["Admins", n(s.admins)],
      ["Office accounts", n(s.offices)],
      ...common,
      ["Departments", n(s.departments)],
      ["Units", n(s.units)],
      ["Registrations", n(s.registrations)],
      ["Published assignments", n(s.assignments_published)],
      ["Exam periods", n(s.exam_periods)],
      ["Library titles", n(s.library_books)],
      ["Fee payments", n(s.fee_payments)],
    ],
    principal: [
      ...common,
      ["Published assignments", n(s.assignments_published)],
      ["Exam periods", n(s.exam_periods)],
      ["Library titles", n(s.library_books)],
      ["Fee payments", n(s.fee_payments)],
      ["Church bookings", n(s.church_bookings_active)],
    ],
    deputy_principal: [
      ...common,
      ["Timetable slots", n(s.timetable_entries)],
      ["Assignments", n(s.assignments)],
      ["Exam periods", n(s.exam_periods)],
      ["Announcements", n(s.announcements)],
    ],
    hod: [
      ["Dept students", n(s.students)],
      ["Units", n(s.units)],
      ["Pending units", n(s.units_pending)],
      ["Registrations", n(s.registrations)],
      ["Assignments", n(s.assignments)],
      ["Dept staff links", n(s.staff_in_departments)],
      ["Applications", n(s.admissions_total)],
    ],
    academic_registrar: [
      ...common,
      ["Fee payments", n(s.fee_payments)],
      ["Timetable slots", n(s.timetable_entries)],
    ],
    examinations: [
      ["Exam periods", n(s.exam_periods)],
      ["Students", n(s.students)],
      ["Published assignments", n(s.assignments_published)],
      ["Programmes", n(s.programmes)],
      ["Timetable slots", n(s.timetable_entries)],
      ["Fee payments", n(s.fee_payments)],
    ],
    library: [
      ["Library titles", n(s.library_books)],
      ["Students", n(s.students)],
      ["Announcements", n(s.announcements)],
    ],
    lecturer: [
      ["Assignments", n(s.assignments)],
      ["Published", n(s.assignments_published)],
      ["Students", n(s.students)],
      ["Units", n(s.units)],
      ["Timetable slots", n(s.timetable_entries)],
      ["Library titles", n(s.library_books)],
    ],
    secretary: [
      ...common,
      ["Registrations", n(s.registrations)],
    ],
    dean: [
      ["Students", n(s.students)],
      ["Active students", n(s.students_active)],
      ["Meals today", n(s.meals_served_today)],
      ["Church bookings", n(s.church_bookings_active)],
    ],
  };

  return byRole[role] || byRole.admin;
}

function mapToRows(map = {}) {
  return Object.entries(map)
    .map(([key, value]) => [prettyKey(key), n(value)])
    .filter(([, value]) => value > 0 || true);
}

function seriesToRows(series = []) {
  return (series || []).map((row) => [row.name || row.label || "Unknown", n(row.count)]);
}

function rolesToRows(rows = []) {
  return (rows || []).map((row) => [prettyKey(row.label || row.role), n(row.count)]);
}

function sectionRows(payload, sectionKey) {
  const meta = SECTION_META[sectionKey];
  if (!meta || !meta.chart) return [];
  const charts = payload.charts || {};
  if (meta.type === "map") return mapToRows(charts[meta.chart] || {});
  if (meta.type === "series") return seriesToRows(charts[meta.chart] || []);
  if (meta.type === "roles") return rolesToRows(charts[meta.chart] || []);
  return [];
}

function drawHeader(doc, y, { title, role, actorName, generatedAt }) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const logoPath = resolveLogoPath();

  doc.rect(0, 0, doc.page.width, 58).fill(BRAND.blue);
  if (logoPath) {
    try {
      doc.image(logoPath, left, 10, { height: 38, fit: [120, 38] });
    } catch {
      /* ignore */
    }
  }
  const textX = logoPath ? left + 52 : left;
  fixedText(doc, BRAND.name, textX, 12, width - 60, {
    height: 14,
    size: 11,
    bold: true,
    color: "#FFFFFF",
  });
  fixedText(doc, title, textX, 28, width - 60, {
    height: 12,
    size: 9,
    color: "#DCE9F8",
  });
  fixedText(
    doc,
    `${formatRole(role)} · ${actorName || "System"} · ${generatedAt}`,
    textX,
    42,
    width - 60,
    { height: 10, size: 8, color: "#DCE9F8" }
  );
  return Math.max(y, 70);
}

function drawMetaBox(doc, y, lines) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const boxH = 14 + lines.length * 12;
  doc.roundedRect(left, y, width, boxH, 6).fillAndStroke(BRAND.soft, BRAND.line);
  fixedText(doc, "REPORT SCOPE", left + 10, y + 4, width - 20, {
    height: 10,
    size: 7,
    bold: true,
    color: BRAND.blue,
  });
  lines.forEach((line, i) => {
    fixedText(doc, line, left + 10, y + 16 + i * 12, width - 20, {
      height: 11,
      size: 8.5,
      color: BRAND.navy,
    });
  });
  return y + boxH + 12;
}

function drawSectionLabel(doc, y, label) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  fixedText(doc, label.toUpperCase(), left, y, width, {
    height: 12,
    size: 9,
    bold: true,
    color: BRAND.blue,
  });
  doc
    .moveTo(left, y + 13)
    .lineTo(left + width, y + 13)
    .strokeColor(BRAND.line)
    .lineWidth(0.8)
    .stroke();
  return y + 18;
}

function drawKpiTable(doc, y, rows) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const colW = width / 2;
  const rowH = 18;

  y = drawSectionLabel(doc, y, "Key figures");

  doc.rect(left, y, width, 16).fill(BRAND.navy);
  fixedText(doc, "Metric", left + 8, y + 3, colW - 70, {
    height: 11,
    size: 8,
    bold: true,
    color: "#FFFFFF",
  });
  fixedText(doc, "Value", left + colW - 58, y + 3, 50, {
    height: 11,
    size: 8,
    bold: true,
    color: "#FFFFFF",
    align: "right",
  });
  fixedText(doc, "Metric", left + colW + 8, y + 3, colW - 70, {
    height: 11,
    size: 8,
    bold: true,
    color: "#FFFFFF",
  });
  fixedText(doc, "Value", left + width - 58, y + 3, 50, {
    height: 11,
    size: 8,
    bold: true,
    color: "#FFFFFF",
    align: "right",
  });
  y += 16;

  // Pair metrics into two columns per row for density
  for (let i = 0; i < rows.length; i += 2) {
    if (y + rowH > bottomLimit(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawSectionLabel(doc, y, "Key figures (continued)");
    }
    const bg = Math.floor(i / 2) % 2 === 0 ? BRAND.soft : "#FFFFFF";
    doc.rect(left, y, width, rowH).fill(bg);

    const leftMetric = rows[i];
    const rightMetric = rows[i + 1];

    fixedText(doc, leftMetric[0], left + 8, y + 4, colW - 70, {
      height: 11,
      size: 8.5,
      color: BRAND.navy,
    });
    fixedText(doc, leftMetric[1].toLocaleString(), left + colW - 58, y + 4, 50, {
      height: 11,
      size: 9,
      bold: true,
      color: BRAND.navy,
      align: "right",
    });

    if (rightMetric) {
      fixedText(doc, rightMetric[0], left + colW + 8, y + 4, colW - 70, {
        height: 11,
        size: 8.5,
        color: BRAND.navy,
      });
      fixedText(doc, rightMetric[1].toLocaleString(), left + width - 58, y + 4, 50, {
        height: 11,
        size: 9,
        bold: true,
        color: BRAND.navy,
        align: "right",
      });
    }
    y += rowH;
  }
  return y + 10;
}

function drawDataTable(doc, y, title, rows, { emptyMessage = "No records in this category." } = {}) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const rowH = 17;
  const labelW = width * 0.72;
  const valueW = width - labelW;

  if (y + 50 > bottomLimit(doc)) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  y = drawSectionLabel(doc, y, title);

  doc.rect(left, y, width, 15).fill(BRAND.blue);
  fixedText(doc, "Category / item", left + 8, y + 3, labelW - 12, {
    height: 10,
    size: 8,
    bold: true,
    color: "#FFFFFF",
  });
  fixedText(doc, "Count", left + labelW, y + 3, valueW - 8, {
    height: 10,
    size: 8,
    bold: true,
    color: "#FFFFFF",
    align: "right",
  });
  y += 15;

  const usable = (rows || []).filter((row) => n(row[1]) > 0);
  if (!usable.length) {
    doc.rect(left, y, width, rowH).fill(BRAND.cream);
    fixedText(doc, emptyMessage, left + 8, y + 4, width - 16, {
      height: 11,
      size: 8,
      color: BRAND.muted,
    });
    return y + rowH + 10;
  }

  const total = usable.reduce((sum, row) => sum + n(row[1]), 0);
  usable.forEach((row, index) => {
    if (y + rowH > bottomLimit(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
      doc.rect(left, y, width, 15).fill(BRAND.blue);
      fixedText(doc, `${title} (continued)`, left + 8, y + 3, labelW - 12, {
        height: 10,
        size: 8,
        bold: true,
        color: "#FFFFFF",
      });
      fixedText(doc, "Count", left + labelW, y + 3, valueW - 8, {
        height: 10,
        size: 8,
        bold: true,
        color: "#FFFFFF",
        align: "right",
      });
      y += 15;
    }
    const bg = index % 2 === 0 ? BRAND.soft : "#FFFFFF";
    doc.rect(left, y, width, rowH).fill(bg);
    const value = n(row[1]);
    const pct = total > 0 ? `(${((value / total) * 100).toFixed(1)}%)` : "";
    fixedText(doc, row[0], left + 8, y + 4, labelW - 12, {
      height: 11,
      size: 8.5,
      color: BRAND.navy,
    });
    fixedText(doc, `${value.toLocaleString()} ${pct}`.trim(), left + labelW, y + 4, valueW - 8, {
      height: 11,
      size: 8.5,
      bold: true,
      color: BRAND.navy,
      align: "right",
    });
    y += rowH;
  });

  // totals row
  doc.rect(left, y, width, rowH).fill(BRAND.navy);
  fixedText(doc, "Total", left + 8, y + 4, labelW - 12, {
    height: 11,
    size: 8.5,
    bold: true,
    color: "#FFFFFF",
  });
  fixedText(doc, total.toLocaleString(), left + labelW, y + 4, valueW - 8, {
    height: 11,
    size: 8.5,
    bold: true,
    color: "#FFFFFF",
    align: "right",
  });
  return y + rowH + 12;
}

function drawFooter(doc, pageNo, pageCount) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  fixedText(
    doc,
    `Page ${pageNo} of ${pageCount}  ·  ${BRAND.short} operational report  ·  Confidential`,
    left,
    doc.page.height - 28,
    width,
    { height: 10, size: 7.5, color: BRAND.muted, align: "center" }
  );
}

function buildDashboardPdf(payload, options = {}) {
  const section =
    options.section && SECTION_META[options.section] ? options.section : "full";
  const title =
    options.title ||
    SECTION_META[section]?.title ||
    `${formatRole(payload.role)} operational report`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: title,
        Author: BRAND.name,
        Subject: "Operational dashboard report",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const generatedAt = new Date(payload.generated_at || Date.now()).toLocaleString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let y = drawHeader(doc, 0, {
      title,
      role: payload.role,
      actorName: options.actorName,
      generatedAt,
    });
    y = drawMetaBox(doc, y, filterLines(payload));
    y = drawKpiTable(doc, y, kpiRowsForRole(payload));

    if (section === "full") {
      const blocks = [
        ["Admissions by status", mapToRows(payload.charts?.admissions_by_status || {})],
        ["Admissions by programme", seriesToRows(payload.charts?.admissions_by_programme || [])],
        ["Students by programme", seriesToRows(payload.charts?.students_by_programme || [])],
        ["Student boarding status", mapToRows(payload.charts?.students_by_boarding || {})],
        ["Student gender", mapToRows(payload.charts?.students_by_gender || {})],
        ["Unit registrations", mapToRows(payload.charts?.registrations_by_status || {})],
        ["Exam periods", mapToRows(payload.charts?.exam_periods_by_status || {})],
        ["Library loans", mapToRows(payload.charts?.library_loans_by_status || {})],
        ["Office staffing", rolesToRows(payload.charts?.office_roles || [])],
      ];
      // Prefer sections that have data; still show empty once for transparency only if none have data
      const withData = blocks.filter(([, rows]) => rows.some((r) => n(r[1]) > 0));
      const toDraw = withData.length ? withData : blocks.slice(0, 3);
      toDraw.forEach(([label, rows]) => {
        y = drawDataTable(doc, y, label, rows);
      });
    } else {
      const meta = SECTION_META[section];
      y = drawDataTable(doc, y, meta.title.replace(/ report$/i, ""), sectionRows(payload, section));
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = {
  buildDashboardPdf,
  SECTION_META,
};
