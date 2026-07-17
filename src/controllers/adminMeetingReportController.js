const { buildAdminMeetingReport } = require("../services/adminMeetingReportService");
const { buildAdminMeetingReportPdf } = require("../services/adminMeetingReportPdf");
const { loadSchoolReportBranding } = require("../services/schoolReportBranding");
const { isAdminPortalUser } = require("../services/adminMeetingLiveAccess");

exports.getAdminMeetingReport = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Only staff can view meeting reports." });
    }
    const report = await buildAdminMeetingReport(req.params.id);
    return res.json({ success: true, data: report });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.exportAdminMeetingReportPdf = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Only staff can export meeting reports." });
    }
    const [report, branding] = await Promise.all([
      buildAdminMeetingReport(req.params.id),
      loadSchoolReportBranding(),
    ]);
    const pdf = await buildAdminMeetingReportPdf(report, branding);
    const slug = String(report.meeting.title || report.meeting.id)
      .replace(/[^a-z0-9-]/gi, "-")
      .slice(0, 60);
    const filename = `staff-meeting-report-${slug}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
