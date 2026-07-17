/**
 * Plug email/SMS/push providers here. Stub keeps cron deterministic without outbound IO.
 */
async function sendWarningNotification(payload) {
  console.info("[fee-warning]", payload.student_id, payload.installment_id, payload.days_overdue);
}

async function sendDeactivationNotification(payload) {
  console.info("[fee-deactivated]", payload.student_id, payload.reason);
}

async function sendReactivationNotification(payload) {
  console.info("[fee-reactivated]", payload.student_id);
}

module.exports = {
  sendWarningNotification,
  sendDeactivationNotification,
  sendReactivationNotification,
};
