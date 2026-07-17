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
const auditTrailRoutes = require("./routes/auditTrailRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

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

app.use("/api/users", userRoutes);
app.use("/api/programmes", programmeRoutes);
app.use("/api/audit-trail", auditTrailRoutes);
app.use("/api/dashboard", dashboardRoutes);

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
