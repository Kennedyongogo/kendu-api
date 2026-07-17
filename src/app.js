const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { initializeModels, setupAssociations } = require("./models");
const { User } = require("./models");
const { errorHandler } = require("./middleware/errorHandler");
const { injectSchoolContext } = require("./middleware/schoolContext");
const auditAdminActivity = require("./middleware/auditAdminActivity");

const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const parentRoutes = require("./routes/parentRoutes");
const schoolAdminRoutes = require("./routes/schoolAdminRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const examRoutes = require("./routes/examRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const examTemplateRoutes = require("./routes/examTemplateRoutes");
const examQuestionRoutes = require("./routes/examQuestionRoutes");
const examAttemptRoutes = require("./routes/examAttemptRoutes");
const proctoringSessionRoutes = require("./routes/proctoringSessionRoutes");
const proctoringEventRoutes = require("./routes/proctoringEventRoutes");
const proctoringRecordingRoutes = require("./routes/proctoringRecordingRoutes");
const studentExamResultRoutes = require("./routes/studentExamResultRoutes");
const subjectGradingScaleRoutes = require("./routes/subjectGradingScaleRoutes");
const overallGradingScaleRoutes = require("./routes/overallGradingScaleRoutes");
const examResultsRoutes = require("./routes/examResultsRoutes");
const reportCardRoutes = require("./routes/reportCardRoutes");
const realtimeRoutes = require("./routes/realtimeRoutes");
const examSessionLogRoutes = require("./routes/examSessionLogRoutes");
const schoolReportsRoutes = require("./routes/schoolReportsRoutes");
const feeStructureRoutes = require("./routes/feeStructureRoutes");
const feeInvoiceRoutes = require("./routes/feeInvoiceRoutes");
const feePaymentRoutes = require("./routes/feePaymentRoutes");
const feePaymentReceiptRoutes = require("./routes/feePaymentReceiptRoutes");
const mpesaRoutes = require("./routes/mpesaRoutes");
const { stkCallback } = require("./controllers/mpesaController");
const curriculumRoutes = require("./routes/curriculumRoutes");
const newsRoutes = require("./routes/newsRoutes");
const schoolServiceRoutes = require("./routes/schoolServiceRoutes");
const portalReviewRoutes = require("./routes/portalReviewRoutes");
const schoolEventRoutes = require("./routes/schoolEventRoutes");
const adminMeetingRoutes = require("./routes/adminMeetingRoutes");
const adminNotificationRoutes = require("./routes/adminNotificationRoutes");
const admissionApplicationRoutes = require("./routes/admissionApplicationRoutes");
const schoolProfileRoutes = require("./routes/schoolProfileRoutes");
const elimuPlusRoutes = require("./routes/elimuPlusRoutes");
const accountingRoutes = require("./routes/accountingRoutes");
const schoolPortalRoutes = require("./routes/schoolPortalRoutes");
const googleMeetRoutes = require("./routes/googleMeetRoutes");
const publicRoutes = require("./routes/publicRoutes");
const auditTrailRoutes = require("./routes/auditTrailRoutes");
const classTransferRoutes = require("./routes/classTransferRoutes");

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.use(injectSchoolContext);
app.use(auditAdminActivity);

const profilesUploadPath = path.join(__dirname, "..", "uploads", "profiles");
const documentsUploadPath = path.join(__dirname, "..", "uploads", "documents");
const authorsUploadPath = path.join(__dirname, "..", "uploads", "authors");
const interestGalleryUploadPath = path.join(__dirname, "..", "uploads", "interest-gallery");
const miscUploadPath = path.join(__dirname, "..", "uploads", "misc");
const postsUploadPath = path.join(__dirname, "..", "uploads", "posts");
const servicesUploadPath = path.join(__dirname, "..", "uploads", "services");
const menuUploadPath = path.join(__dirname, "..", "uploads", "menu");
const projectsUploadPath = path.join(__dirname, "..", "uploads", "projects");
const marketplaceProfilesUploadPath = path.join(__dirname, "..", "uploads", "marketplace-profiles");
const trainingEventsUploadPath = path.join(__dirname, "..", "uploads", "training-events");
const grantsUploadPath = path.join(__dirname, "..", "uploads", "grants");
const partnersUploadPath = path.join(__dirname, "..", "uploads", "partners");
const marketplaceListingsUploadPath = path.join(__dirname, "..", "uploads", "marketplace-listings");
const proctoringRecordingsUploadPath = path.join(__dirname, "..", "uploads", "proctoring-recordings");
const reportCardsUploadPath = path.join(__dirname, "..", "uploads", "report-cards");
if (!fs.existsSync(reportCardsUploadPath)) {
  fs.mkdirSync(reportCardsUploadPath, { recursive: true });
}
const postersUploadPath = path.join(__dirname, "..", "uploads", "posters");
const schoolLogosUploadPath = path.join(__dirname, "..", "uploads", "school-logos");
const teacherProfilesUploadPath = path.join(__dirname, "..", "uploads", "teacher-profiles");
const studentProfilesUploadPath = path.join(__dirname, "..", "uploads", "student-profiles");
const admissionDocumentsUploadPath = path.join(__dirname, "..", "uploads", "admission-documents");
const examAnswersUploadPath = path.join(__dirname, "..", "uploads", "exam-answers");
const examPdfTemplatesUploadPath = path.join(__dirname, "..", "uploads", "exam-pdf-templates");
const examPdfCompletedUploadPath = path.join(__dirname, "..", "uploads", "exam-pdf-completed");
const examPdfWorkingPapersUploadPath = path.join(__dirname, "..", "uploads", "exam-pdf-working-papers");
const examPdfMarkedReturnsUploadPath = path.join(__dirname, "..", "uploads", "exam-pdf-marked-returns");
const assignmentAnswersUploadPath = path.join(__dirname, "..", "uploads", "assignment-answers");
const assignmentPdfTemplatesUploadPath = path.join(__dirname, "..", "uploads", "assignment-pdf-templates");
const assignmentPdfWorkingPapersUploadPath = path.join(__dirname, "..", "uploads", "assignment-pdf-working-papers");
const assignmentPdfMarkedReturnsUploadPath = path.join(__dirname, "..", "uploads", "assignment-pdf-marked-returns");

app.use("/uploads/profiles", express.static(profilesUploadPath));
app.use("/uploads/documents", express.static(documentsUploadPath));
app.use("/uploads/authors", express.static(authorsUploadPath));
app.use("/uploads/interest-gallery", express.static(interestGalleryUploadPath));
app.use("/uploads/misc", express.static(miscUploadPath));
app.use("/uploads/posts", express.static(postsUploadPath));
app.use("/uploads/services", express.static(servicesUploadPath));
app.use("/uploads/menu", express.static(menuUploadPath));
app.use("/uploads/projects", express.static(projectsUploadPath));
app.use("/uploads/marketplace-profiles", express.static(marketplaceProfilesUploadPath));
app.use("/uploads/training-events", express.static(trainingEventsUploadPath));
app.use("/uploads/grants", express.static(grantsUploadPath));
app.use("/uploads/partners", express.static(partnersUploadPath));
app.use("/uploads/marketplace-listings", express.static(marketplaceListingsUploadPath));
app.use("/uploads/proctoring-recordings", express.static(proctoringRecordingsUploadPath));
app.use("/uploads/report-cards", express.static(reportCardsUploadPath));
app.use("/uploads/posters", express.static(postersUploadPath));
app.use("/uploads/school-logos", express.static(schoolLogosUploadPath));
app.use("/uploads/teacher-profiles", cors(), express.static(teacherProfilesUploadPath));
app.use("/uploads/student-profiles", cors(), express.static(studentProfilesUploadPath));
app.use("/uploads/admission-documents", cors(), express.static(admissionDocumentsUploadPath));
app.use("/uploads/exam-answers", cors(), express.static(examAnswersUploadPath));
app.use("/uploads/exam-pdf-templates", cors(), express.static(examPdfTemplatesUploadPath));
app.use("/uploads/exam-pdf-completed", cors(), express.static(examPdfCompletedUploadPath));
app.use("/uploads/exam-pdf-working-papers", cors(), express.static(examPdfWorkingPapersUploadPath));
app.use("/uploads/exam-pdf-marked-returns", cors(), express.static(examPdfMarkedReturnsUploadPath));
app.use("/uploads/assignment-answers", cors(), express.static(assignmentAnswersUploadPath));
app.use("/uploads/assignment-pdf-templates", cors(), express.static(assignmentPdfTemplatesUploadPath));
app.use("/uploads/assignment-pdf-working-papers", cors(), express.static(assignmentPdfWorkingPapersUploadPath));
app.use("/uploads/assignment-pdf-marked-returns", cors(), express.static(assignmentPdfMarkedReturnsUploadPath));

app.use("/api/users", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/school-admins", schoolAdminRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/exam-templates", examTemplateRoutes);
app.use("/api/exam-questions", examQuestionRoutes);
app.use("/api/exam-attempts", examAttemptRoutes);
app.use("/api/proctoring-sessions", proctoringSessionRoutes);
app.use("/api/proctoring-events", proctoringEventRoutes);
app.use("/api/proctoring-recordings", proctoringRecordingRoutes);
app.use("/api/student-exam-results", studentExamResultRoutes);
app.use("/api/grading/subject-scales", subjectGradingScaleRoutes);
app.use("/api/grading/overall-scales", overallGradingScaleRoutes);
app.use("/api/report-cards", reportCardRoutes);
app.use("/api/audit-trail", auditTrailRoutes);
app.use("/api", examResultsRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/exam-session-logs", examSessionLogRoutes);
app.use("/api/reports", schoolReportsRoutes);
app.use("/api/fee-structures", feeStructureRoutes);
app.use("/api/fee-invoices", feeInvoiceRoutes);
app.use("/api/fee-payments", feePaymentRoutes);
app.use("/api/fee-receipts", feePaymentReceiptRoutes);
app.use("/api/mpesa", mpesaRoutes);
/** Alias for Daraja docs / ngrok setups that use /mpesa/callback */
app.post("/mpesa/callback", stkCallback);
app.use("/api/curricula", curriculumRoutes);
app.use("/api/class-transfer", classTransferRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/school-services", schoolServiceRoutes);
app.use("/api/portal-reviews", portalReviewRoutes);
app.use("/api/events", schoolEventRoutes);
app.use("/api/admin-meetings", adminMeetingRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);
app.use("/api/admission-applications", admissionApplicationRoutes);
app.use("/api/school-profile", schoolProfileRoutes);
app.use("/api/elimu-plus", elimuPlusRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/school-portal", schoolPortalRoutes);
app.use("/api/google-meet", googleMeetRoutes);
app.use("/api/public", publicRoutes);

app.post("/api/auth/forgot", async (req, res) => {
  try {
    const emailAddr = req.body.Email || req.body.email;
    if (!emailAddr) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const user = await User.findOne({ where: { email: emailAddr } });
    if (!user) {
      return res.json({
        success: true,
        message: "If that email exists, a reset link has been sent.",
      });
    }
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashed = await bcrypt.hash(tempPassword, 10);
    await user.update({ password_hash: hashed });
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: emailAddr,
      subject: "Password reset",
      text: `Your temporary password is: ${tempPassword}`,
    });
    return res.json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const appInitialized = (async () => {
  await initializeModels();
  setupAssociations();
})();

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ success: false, message: "Route not found" });
    return;
  }
  next();
});

app.use(errorHandler);

module.exports = { app, appInitialized };
