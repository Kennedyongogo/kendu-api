/** Allowed admission application workflow statuses. */
exports.ADMISSION_STATUSES = [
  "pending",
  "interview_scheduled",
  "accepted",
  "rejected",
];

exports.DEFAULT_ADMISSION_STATUS = "pending";

/** Legacy values stored before status simplification — mapped on read/display. */
exports.LEGACY_ADMISSION_STATUS_MAP = {
  under_review: "pending",
  documents_verified: "pending",
  waitlisted: "pending",
};

exports.normalizeAdmissionStatus = (value) => {
  const raw = String(value || "").trim();
  return exports.LEGACY_ADMISSION_STATUS_MAP[raw] || raw;
};

exports.isValidAdmissionStatus = (value) =>
  exports.ADMISSION_STATUSES.includes(exports.normalizeAdmissionStatus(value));

exports.ADMISSION_STATUS_LABELS = {
  pending: "Pending",
  interview_scheduled: "Interview scheduled",
  accepted: "Accepted",
  rejected: "Rejected",
};

exports.getAdmissionStatusLabel = (value) => {
  const normalized = exports.normalizeAdmissionStatus(value);
  return exports.ADMISSION_STATUS_LABELS[normalized] || normalized;
};

/** Fields required when setting a given status (admin update). */
exports.STATUS_REQUIRED_FIELDS = {
  interview_scheduled: ["interview_date"],
  accepted: ["acceptance_notes"],
  rejected: ["rejection_reason"],
};

exports.validateAdmissionStatusPayload = (status, body = {}) => {
  const normalized = exports.normalizeAdmissionStatus(status);
  if (!exports.isValidAdmissionStatus(normalized)) {
    return `Invalid status. Allowed: ${exports.ADMISSION_STATUSES.join(", ")}`;
  }

  if (normalized === "interview_scheduled") {
    if (!body.interview_date) {
      return "Interview date is required so the applicant can be notified by email.";
    }
  }
  if (normalized === "accepted") {
    if (!String(body.acceptance_notes || "").trim()) {
      return "Acceptance notes are required (e.g. joining date and next steps).";
    }
  }
  if (normalized === "rejected") {
    if (!String(body.rejection_reason || "").trim()) {
      return "Rejection reason is required so it can be sent to the applicant.";
    }
  }

  return null;
};
