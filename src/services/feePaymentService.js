const {
  FeeInvoice,
  FeePayment,
  StudentLevelFeeCredit,
} = require("../models");
const { buildReceiptNumber } = require("../utils/feeReceiptNumber");

function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function deriveStatus(amountDue, amountPaid, balance, current) {
  if (current === "cancelled") return "cancelled";
  if (balance <= 0.01) return "paid";
  if (amountPaid > 0.01) return "partial";
  return current === "draft" ? "draft" : "sent";
}

async function getLevelCredit(studentId, levelId, transaction) {
  if (!studentId || !levelId) return 0;
  const row = await StudentLevelFeeCredit.findOne({
    where: { student_id: studentId, curriculum_class_level_id: levelId },
    transaction,
  });
  return row ? money(row.credit_balance) : 0;
}

async function addLevelCredit(studentId, levelId, delta, transaction) {
  if (!delta || delta <= 0) return money(await getLevelCredit(studentId, levelId, transaction));
  const [row] = await StudentLevelFeeCredit.findOrCreate({
    where: { student_id: studentId, curriculum_class_level_id: levelId },
    defaults: { credit_balance: 0 },
    transaction,
  });
  const next = money(Number(row.credit_balance) + delta);
  await row.update({ credit_balance: next }, { transaction });
  return next;
}

async function applyPayment({
  invoice,
  amount,
  paymentMethod,
  reference,
  notes,
  parentId,
  recordedByUserId,
  transaction,
}) {
  const payAmount = money(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const balanceBefore = money(invoice.balance);
  const applied = money(Math.min(payAmount, balanceBefore));
  const excess = money(payAmount - applied);

  const amountPaid = money(Number(invoice.amount_paid) + applied);
  const balance = money(Number(invoice.amount_due) - amountPaid);
  const status = deriveStatus(invoice.amount_due, amountPaid, balance, invoice.status);

  await invoice.update(
    {
      amount_paid: amountPaid,
      balance: Math.max(0, balance),
      status,
    },
    { transaction }
  );

  let creditBalance = await getLevelCredit(invoice.student_id, invoice.curriculum_class_level_id, transaction);
  if (excess > 0.01) {
    creditBalance = await addLevelCredit(invoice.student_id, invoice.curriculum_class_level_id, excess, transaction);
  }

  const payment = await FeePayment.create(
    {
      fee_invoice_id: invoice.id,
      student_id: invoice.student_id,
      parent_id: parentId || null,
      curriculum_class_level_id: invoice.curriculum_class_level_id,
      amount: payAmount,
      applied_to_invoice: applied,
      excess_amount: excess,
      payment_method: paymentMethod || "manual",
      reference: reference || null,
      notes: notes || null,
      paid_at: new Date(),
      recorded_by_user_id: recordedByUserId || null,
      receipt_number: buildReceiptNumber(),
    },
    { transaction }
  );

  return {
    payment,
    payment_receipt: {
      receipt_number: payment.receipt_number,
      payment_id: payment.id,
      amount_submitted: payAmount,
      applied_to_invoice: applied,
      excess_from_payment: excess,
      has_excess: excess > 0.01,
      invoice_credit_balance: creditBalance,
      carry_forward_message:
        excess > 0.01
          ? "The excess amount is stored as credit on this student's term/level and can offset future fee requirements."
          : null,
    },
  };
}

module.exports = {
  money,
  applyPayment,
};
