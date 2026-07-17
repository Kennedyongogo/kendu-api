const { Op } = require("sequelize");
const {
  sequelize,
  FeeInvoice,
  Parent,
  MpesaStkRequest,
} = require("../models");
const { isMpesaConfigured } = require("../config/mpesa");
const { initiateStkPush, parseCallbackMetadata } = require("../services/mpesaService");
const { applyPayment, money } = require("../services/feePaymentService");

async function assertParentOwnsInvoice(parent, invoiceId, transaction) {
  const invoice = await FeeInvoice.findByPk(invoiceId, { transaction });
  if (!invoice) {
    const err = new Error("Invoice not found");
    err.status = 404;
    throw err;
  }
  const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.map(String) : [];
  if (!studentIds.includes(String(invoice.student_id))) {
    const err = new Error("This invoice is not linked to your account.");
    err.status = 403;
    throw err;
  }
  if (invoice.status === "cancelled") {
    const err = new Error("This invoice was cancelled.");
    err.status = 400;
    throw err;
  }
  if (invoice.status === "paid") {
    const err = new Error("This invoice is already fully paid.");
    err.status = 400;
    throw err;
  }
  return invoice;
}

exports.initiateParentFeeStkPush = async (req, res) => {
  try {
    if (!isMpesaConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "M-Pesa is not configured on the server. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, and MPESA_CALLBACK_BASE_URL.",
      });
    }

    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const { phone_number, amount } = req.body || {};
    if (!phone_number) {
      return res.status(400).json({ success: false, message: "M-Pesa phone number is required." });
    }
    const invoice = await assertParentOwnsInvoice(parent, req.params.invoiceId);

    const payAmount = money(amount);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: "Enter a valid payment amount." });
    }
    if (payAmount > money(invoice.balance) + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot exceed the invoice balance (KES ${Number(invoice.balance).toLocaleString()}).`,
      });
    }

    const pending = await MpesaStkRequest.findOne({
      where: {
        fee_invoice_id: invoice.id,
        status: "pending",
        created_at: { [Op.gte]: new Date(Date.now() - 3 * 60 * 1000) },
      },
    });
    if (pending) {
      return res.status(409).json({
        success: false,
        message: "An M-Pesa prompt is already pending for this invoice. Check your phone or wait a moment.",
        checkout_request_id: pending.checkout_request_id,
      });
    }

    const stk = await initiateStkPush({
      phoneNumber: phone_number,
      amount: payAmount,
      accountReference: invoice.invoice_number,
      transactionDesc: "School fees",
    });

    const row = await MpesaStkRequest.create({
      fee_invoice_id: invoice.id,
      parent_id: parent.id,
      initiated_by_user_id: req.user.id,
      phone_number: stk.phone,
      amount: stk.amount,
      merchant_request_id: stk.merchantRequestId,
      checkout_request_id: stk.checkoutRequestId,
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      data: {
        id: row.id,
        checkout_request_id: row.checkout_request_id,
        message: stk.responseDescription || "STK push sent. Enter your M-Pesa PIN on your phone.",
      },
    });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({
      success: false,
      message: error.response?.data?.errorMessage || error.message || "Could not start M-Pesa payment.",
    });
  }
};

exports.getStkPushStatus = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const row = await MpesaStkRequest.findOne({
      where: { checkout_request_id: req.params.checkoutRequestId },
    });
    if (!row || String(row.parent_id) !== String(parent.id)) {
      return res.status(404).json({ success: false, message: "Payment request not found" });
    }

    return res.json({
      success: true,
      data: {
        status: row.status,
        result_code: row.result_code,
        result_desc: row.result_desc,
        mpesa_receipt_number: row.mpesa_receipt_number,
        fee_payment_id: row.fee_payment_id,
        amount: row.amount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

async function completeStkFromCallback(stkRow, callbackPayload) {
  if (!stkRow || stkRow.status === "completed") return;

  const stk = callbackPayload?.Body?.stkCallback;
  if (!stk) return;

  const resultCode = Number(stk.ResultCode);
  const resultDesc = stk.ResultDesc || null;
  const metadata = parseCallbackMetadata(stk.CallbackMetadata?.Item);
  const receipt = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : null;

  if (resultCode !== 0) {
    await stkRow.update({
      status: "failed",
      result_code: resultCode,
      result_desc: resultDesc,
      raw_callback: callbackPayload,
    });
    return;
  }

  if (receipt) {
    const existing = await MpesaStkRequest.findOne({
      where: { mpesa_receipt_number: receipt, status: "completed" },
    });
    if (existing) return;
  }

  const transaction = await sequelize.transaction();
  try {
    const invoice = await FeeInvoice.findByPk(stkRow.fee_invoice_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) {
      await transaction.rollback();
      await stkRow.update({
        status: "failed",
        result_code: resultCode,
        result_desc: "Invoice not found during callback",
        raw_callback: callbackPayload,
      });
      return;
    }

    const paidAmount = money(metadata.Amount || stkRow.amount);
    const result = await applyPayment({
      invoice,
      amount: paidAmount,
      paymentMethod: "mpesa",
      reference: receipt,
      notes: `M-Pesa STK · ${stkRow.phone_number}`,
      parentId: stkRow.parent_id,
      transaction,
    });

    await stkRow.update(
      {
        status: "completed",
        result_code: resultCode,
        result_desc: resultDesc,
        mpesa_receipt_number: receipt,
        fee_payment_id: result.payment.id,
        raw_callback: callbackPayload,
      },
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    await stkRow.update({
      status: "failed",
      result_code: resultCode,
      result_desc: error.message,
      raw_callback: callbackPayload,
    });
  }
}

exports.stkCallback = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) return;

    const row = await MpesaStkRequest.findOne({
      where: { checkout_request_id: stk.CheckoutRequestID },
    });
    if (!row) return;

    await completeStkFromCallback(row, req.body);
  } catch (error) {
    console.error("M-Pesa callback error:", error.message);
  }
};

exports.getMpesaConfigStatus = async (_req, res) => {
  return res.json({
    success: true,
    data: {
      configured: isMpesaConfigured(),
      env: process.env.MPESA_ENV || "sandbox",
    },
  });
};
