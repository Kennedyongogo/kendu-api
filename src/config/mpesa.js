const mpesaConfig = {
  consumerKey: process.env.MPESA_CONSUMER_KEY || "",
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || "",
  shortCode: process.env.MPESA_SHORTCODE || "",
  passkey: process.env.MPESA_PASSKEY || "",
  /** sandbox | production */
  env: String(process.env.MPESA_ENV || "sandbox").toLowerCase(),
  callbackBaseUrl: (process.env.MPESA_CALLBACK_BASE_URL || process.env.API_PUBLIC_URL || "").replace(/\/$/, ""),
  /** CustomerPayBillOnline (paybill) or CustomerBuyGoodsOnline (till) */
  transactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
};

function mpesaBaseUrl() {
  return mpesaConfig.env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function isMpesaConfigured() {
  return Boolean(
    mpesaConfig.consumerKey &&
      mpesaConfig.consumerSecret &&
      mpesaConfig.shortCode &&
      mpesaConfig.passkey &&
      mpesaConfig.callbackBaseUrl
  );
}

function getCallbackUrl() {
  return `${mpesaConfig.callbackBaseUrl}/api/mpesa/callback`;
}

module.exports = {
  mpesaConfig,
  mpesaBaseUrl,
  isMpesaConfigured,
  getCallbackUrl,
};
