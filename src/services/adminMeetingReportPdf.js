const { buildEventReportPdf } = require("./eventReportPdf");

/** Map admin meeting report to event PDF shape (reuses branded PDF generator). */
function buildAdminMeetingReportPdf(report, branding = {}) {
  const m = report.meeting || {};
  const mapped = {
    generated_at: report.generated_at,
    event: {
      title: m.title || "Staff meeting",
      event_type: "staff_meeting",
      delivery_mode: "online",
      session_status: m.session_status,
      start_date: m.start_time,
      end_date: m.end_time,
      location: m.creator
        ? `Host: ${m.creator.full_name || m.creator.username || "Staff"}`
        : "Admin meeting",
    },
    summary: report.summary,
    attendees: report.attendees,
    attendance_log: report.attendance_log,
    chat: report.chat,
  };
  return buildEventReportPdf(mapped, branding);
}

module.exports = { buildAdminMeetingReportPdf };
