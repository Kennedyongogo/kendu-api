const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const { initializeModels, setupAssociations } = require("./models");
const { User } = require("./models");
const { errorHandler } = require("./middleware/errorHandler");
const auditCrudActivity = require("./middleware/auditCrudActivity");

const userRoutes = require("./routes/userRoutes");
const programmeRoutes = require("./routes/programmeRoutes");
const programmeResourceRoutes = require("./routes/programmeResourceRoutes");
const admissionRoutes = require("./routes/admissionRoutes");
const musicRoutes = require("./routes/musicRoutes");
const auditTrailRoutes = require("./routes/auditTrailRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const accountingRoutes = require("./routes/accountingRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const unitRoutes = require("./routes/unitRoutes");
const accessRoutes = require("./routes/accessRoutes");
const mealRoutes = require("./routes/mealRoutes");
const announcementRoutes = require("./routes/announcementRoutes");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());
app.use(auditCrudActivity);

const profilesUploadPath = path.join(__dirname, "..", "uploads", "profiles");
if (!fs.existsSync(profilesUploadPath)) {
  fs.mkdirSync(profilesUploadPath, { recursive: true });
}
app.use("/uploads/profiles", express.static(profilesUploadPath));

const programmesUploadPath = path.join(__dirname, "..", "uploads", "programmes");
if (!fs.existsSync(programmesUploadPath)) {
  fs.mkdirSync(programmesUploadPath, { recursive: true });
}
app.use("/uploads/programmes", express.static(programmesUploadPath));

const admissionsUploadPath = path.join(__dirname, "..", "uploads", "admissions");
if (!fs.existsSync(admissionsUploadPath)) {
  fs.mkdirSync(admissionsUploadPath, { recursive: true });
}
app.use("/uploads/admissions", express.static(admissionsUploadPath));

const musicUploadPath = path.join(__dirname, "..", "uploads", "music");
if (!fs.existsSync(musicUploadPath)) {
  fs.mkdirSync(musicUploadPath, { recursive: true });
}
app.use("/uploads/music", express.static(musicUploadPath));

const announcementsUploadPath = path.join(__dirname, "..", "uploads", "announcements");
if (!fs.existsSync(announcementsUploadPath)) {
  fs.mkdirSync(announcementsUploadPath, { recursive: true });
}
app.use("/uploads/announcements", express.static(announcementsUploadPath));

app.use("/api/users", userRoutes);
// Programmes + nested hour-distributions, modules, fees, subject-requirements
// GET/POST   /api/programmes
// GET/PUT/DELETE /api/programmes/:id
// GET/POST   /api/programmes/:id/hour-distributions
// PUT/DELETE /api/programmes/:id/hour-distributions/:hourId
// GET/POST   /api/programmes/:id/modules
// PUT/DELETE /api/programmes/:id/modules/:moduleId
// GET/POST   /api/programmes/:id/fees
// PUT/DELETE /api/programmes/:id/fees/:feeId
// GET/POST   /api/programmes/:id/subject-requirements
// PUT/DELETE /api/programmes/:id/subject-requirements/:requirementId
app.use("/api/programmes", programmeRoutes);
// Global programme resources (paginated lists + CRUD by id)
// GET/POST /api/programme-resources/fees
// GET/PUT/DELETE /api/programme-resources/fees/:feeId
// GET/POST /api/programme-resources/hours
// GET/PUT/DELETE /api/programme-resources/hours/:hourId
// GET/POST /api/programme-resources/modules
// GET/PUT/DELETE /api/programme-resources/modules/:moduleId
// GET/POST /api/programme-resources/subjects
// GET/PUT/DELETE /api/programme-resources/subjects/:requirementId
app.use("/api/programme-resources", programmeResourceRoutes);
// Admissions
// POST          /api/admissions              (public apply)
// GET           /api/admissions              (admin list)
// GET/PUT/DELETE /api/admissions/:id         (admin)
app.use("/api/admissions", admissionRoutes);
// Music tracks (background audio for public home)
// GET            /api/music/public   (public active list)
// GET/POST       /api/music          (admin)
// GET/PUT/DELETE /api/music/:id      (admin)
app.use("/api/music", musicRoutes);
app.use("/api/audit-trail", auditTrailRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/meals", mealRoutes);
// Announcements / News & Events
// GET /api/announcements/public          (public site, before login)
// GET /api/announcements/public/:slug    (single public post)
// GET /api/announcements/student         (student portal, authenticated)
// GET/POST/PUT/DELETE /api/announcements  (admin manage; staff read-only)
app.use("/api/announcements", announcementRoutes);

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
