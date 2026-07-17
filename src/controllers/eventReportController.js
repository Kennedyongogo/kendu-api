const { buildEventReport } = require("../services/eventReportService");
const { buildEventReportPdf } = require("../services/eventReportPdf");
const { loadSchoolReportBranding } = require("../services/schoolReportBranding");
const { isEventStaff } = require("../services/eventLiveAccess");

exports.getEventReport = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can view event reports." });
    }
    const report = await buildEventReport(req.params.id);
    return res.json({ success: true, data: report });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.exportEventReportPdf = async (req, res) => {
  try {
    if (!isEventStaff(req)) {
      return res.status(403).json({ success: false, message: "Only staff can export event reports." });
    }
    const [report, branding] = await Promise.all([
      buildEventReport(req.params.id),
      loadSchoolReportBranding(),
    ]);
    const pdf = await buildEventReportPdf(report, branding);
    const slug = String(report.event.slug || report.event.id).replace(/[^a-z0-9-]/gi, "-");
    const filename = `event-report-${slug}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
