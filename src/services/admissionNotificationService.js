const {
  getAdmissionStatusLabel,
  normalizeAdmissionStatus,
} = require("../constants/admissionStatuses");

function formatInterviewDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildAdmissionEmail(application) {
  const status = normalizeAdmissionStatus(application.status);
  const applicantName = application.applicant_name || "Applicant";
  const studentName = application.student_name || "your child";
  const ref = application.application_number || application.id;

  const base = {
    to: application.applicant_email,
    applicationNumber: ref,
    studentName,
    applicantName,
    status,
    statusLabel: getAdmissionStatusLabel(status),
  };

  if (status === "interview_scheduled") {
    const when = formatInterviewDate(application.interview_date);
    return {
      ...base,
      subject: `Interview scheduled — ${ref}`,
      template: "admission_interview_scheduled",
      bodyText: [
        `Dear ${applicantName},`,
        "",
        `Your admission application (${ref}) for ${studentName} has been reviewed.`,
        `An interview has been scheduled for:`,
        "",
        when,
        "",
        "Please arrive on time and bring any documents requested by the school.",
        "",
        "Regards,",
        "Admissions Office",
      ].join("\n"),
    };
  }

  if (status === "accepted") {
    return {
      ...base,
      subject: `Admission accepted — ${ref}`,
      template: "admission_accepted",
      bodyText: [
        `Dear ${applicantName},`,
        "",
        `Congratulations! ${studentName}'s admission application (${ref}) has been accepted.`,
        "",
        String(application.acceptance_notes || "").trim(),
        "",
        "Regards,",
        "Admissions Office",
      ].join("\n"),
    };
  }

  if (status === "rejected") {
    return {
      ...base,
      subject: `Admission update — ${ref}`,
      template: "admission_rejected",
      bodyText: [
        `Dear ${applicantName},`,
        "",
        `Thank you for applying for ${studentName} (${ref}).`,
        "After careful review, we are unable to offer a place at this time.",
        "",
        "Reason:",
        String(application.rejection_reason || "").trim(),
        "",
        "Regards,",
        "Admissions Office",
      ].join("\n"),
    };
  }

  return null;
}

/**
 * Email skeleton — logs payload until SMTP/nodemailer is wired.
 * Set SMTP_HOST (and related env vars) to enable real delivery later.
 */
async function notifyAdmissionUpdate(application, { trigger = "status_change" } = {}) {
  const status = normalizeAdmissionStatus(application.status);
  const notifyStatuses = ["interview_scheduled", "accepted", "rejected"];

  if (!notifyStatuses.includes(status)) {
    return { sent: false, skipped: true, reason: "status_not_notifiable" };
  }

  const email = String(application.applicant_email || "").trim();
  if (!email) {
    console.info("[admission-notify] Skipped — no applicant email", {
      applicationNumber: application.application_number,
      status,
      trigger,
    });
    return { sent: false, skipped: true, reason: "no_applicant_email" };
  }

  const payload = buildAdmissionEmail(application);
  if (!payload) {
    return { sent: false, skipped: true, reason: "no_template" };
  }

  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

  if (!smtpReady) {
    console.info("[admission-notify] Skeleton (SMTP not configured)", {
      trigger,
      to: email,
      subject: payload.subject,
      template: payload.template,
      preview: payload.bodyText,
    });
    return {
      sent: false,
      skipped: false,
      reason: "smtp_not_configured",
      preview: {
        to: email,
        subject: payload.subject,
        bodyText: payload.bodyText,
      },
    };
  }

  // TODO: integrate nodemailer (same pattern as password reset in app.js)
  console.info("[admission-notify] SMTP configured — delivery hook pending", {
    to: email,
    subject: payload.subject,
    template: payload.template,
  });

  return {
    sent: false,
    skipped: false,
    reason: "delivery_hook_pending",
    preview: {
      to: email,
      subject: payload.subject,
      bodyText: payload.bodyText,
    },
  };
}

module.exports = {
  buildAdmissionEmail,
  notifyAdmissionUpdate,
  formatInterviewDate,
};
