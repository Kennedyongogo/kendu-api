function buildReceiptNumber() {
  const t = Date.now().toString(36).toUpperCase();
  return `RCP-${t.slice(-8)}`;
}

function receiptNumberFromPaymentId(id) {
  const compact = String(id || "")
    .replace(/-/g, "")
    .toUpperCase();
  if (!compact) return buildReceiptNumber();
  return `RCP-${compact.slice(-10)}`;
}

module.exports = { buildReceiptNumber, receiptNumberFromPaymentId };
