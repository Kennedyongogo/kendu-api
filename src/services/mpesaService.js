const axios = require("axios");

const isSandbox = process.env.MPESA_ENV !== "production";
const baseUrl = isSandbox
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

function configured() {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_SHORTCODE &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_CALLBACK_URL
  );
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan M-Pesa phone number");
}

async function accessToken() {
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const response = await axios.get(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return response.data.access_token;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function initiateStkPush({ phone, amount, accountReference, description }) {
  if (!configured()) {
    const error = new Error(
      "Online M-Pesa payment is not configured. Please contact the accounts office."
    );
    error.status = 503;
    throw error;
  }

  const normalizedPhone = normalizePhone(phone);
  const time = timestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(
    `${shortcode}${process.env.MPESA_PASSKEY}${time}`
  ).toString("base64");
  const token = await accessToken();
  const response = await axios.post(
    `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: time,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
      Amount: Math.round(Number(amount)),
      PartyA: normalizedPhone,
      PartyB: shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(description || "School fees").slice(0, 30),
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return { ...response.data, phone: normalizedPhone };
}

module.exports = { configured, normalizePhone, initiateStkPush };
