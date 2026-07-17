const axios = require("axios");
const {
  mpesaConfig,
  mpesaBaseUrl,
  getCallbackUrl,
} = require("../config/mpesa");

let tokenCache = { value: null, expiresAt: 0 };

function timestampKenya() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function buildPassword(shortCode, passkey, timestamp) {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

/** Normalize Kenyan numbers to 2547XXXXXXXX */
function normalizeMpesaPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith("7") && digits.length === 9) return `254${digits}`;
  if (digits.startsWith("1") && digits.length === 9) return `254${digits}`;
  return null;
}

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt > now + 5000) {
    return tokenCache.value;
  }

  const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString("base64");
  const url = `${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 30000,
  });

  if (!data?.access_token) {
    throw new Error("M-Pesa authentication failed.");
  }

  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache = {
    value: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return data.access_token;
}

async function initiateStkPush({ phoneNumber, amount, accountReference, transactionDesc }) {
  const token = await getAccessToken();
  const timestamp = timestampKenya();
  const password = buildPassword(mpesaConfig.shortCode, mpesaConfig.passkey, timestamp);
  const phone = normalizeMpesaPhone(phoneNumber);
  if (!phone) {
    throw new Error("Enter a valid Safaricom number (e.g. 07XX XXX XXX).");
  }

  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt < 1) {
    throw new Error("Amount must be at least KES 1.");
  }

  const payload = {
    BusinessShortCode: mpesaConfig.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: mpesaConfig.transactionType,
    Amount: amt,
    PartyA: phone,
    PartyB: mpesaConfig.shortCode,
    PhoneNumber: phone,
    CallBackURL: getCallbackUrl(),
    AccountReference: String(accountReference || "SchoolFees").slice(0, 12),
    TransactionDesc: String(transactionDesc || "School fees").slice(0, 13),
  };

  const url = `${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`;
  const { data } = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  if (data.ResponseCode && String(data.ResponseCode) !== "0") {
    throw new Error(data.ResponseDescription || data.errorMessage || "M-Pesa STK push failed.");
  }

  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    responseDescription: data.CustomerMessage || data.ResponseDescription,
    phone,
    amount: amt,
  };
}

function parseCallbackMetadata(items) {
  const map = {};
  for (const item of items || []) {
    if (item?.Name) map[item.Name] = item.Value;
  }
  return map;
}

module.exports = {
  normalizeMpesaPhone,
  initiateStkPush,
  parseCallbackMetadata,
};
