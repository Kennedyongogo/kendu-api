const { Op } = require("sequelize");
const {
  FeePayment,
  FeeInvoice,
  Student,
  Parent,
  User,
  CurriculumClassLevel,
} = require("../models");
const { buildFeePaymentReceiptPdf } = require("../services/feePaymentReceiptPdf");
const { money: paymentMoney } = require("../services/feePaymentService");

const userExclude = { exclude: ["password_hash"] };

const receiptIncludes = [
  {
    model: FeeInvoice,
    as: "fee_invoice",
    attributes: [
      "id",
      "invoice_number",
      "amount_due",
      "amount_paid",
      "balance",
      "status",
      "term_fee_amount",
    ],
    required: false,
  },
  {
    model: Student,
    as: "student",
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
  {
    model: Parent,
    as: "parent",
    required: false,
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
  {
    model: CurriculumClassLevel,
    as: "curriculum_class_level",
    attributes: ["id", "name"],
    required: false,
  },
];

function money(n) {
  return paymentMoney(n);
}

function serializeReceipt(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  const studentUser = plain.student?.user;
  const parentUser = plain.parent?.user;
  return {
    id: plain.id,
    receipt_number: plain.receipt_number,
    amount: money(plain.amount),
    applied_to_invoice: money(plain.applied_to_invoice),
    excess_amount: money(plain.excess_amount),
    payment_method: plain.payment_method,
    reference: plain.reference || null,
    notes: plain.notes || null,
    paid_at: plain.paid_at,
    created_at: plain.created_at,
    student: plain.student
      ? {
          id: plain.student.id,
          admission_number: plain.student.admission_number,
          name: studentUser?.full_name || studentUser?.username || plain.student.admission_number,
        }
      : null,
    parent: plain.parent
      ? {
          id: plain.parent.id,
          name: parentUser?.full_name || parentUser?.username || null,
        }
      : null,
    invoice: plain.fee_invoice
      ? {
          id: plain.fee_invoice.id,
          invoice_number: plain.fee_invoice.invoice_number,
          balance: money(plain.fee_invoice.balance),
          status: plain.fee_invoice.status,
        }
      : null,
    level_name: plain.curriculum_class_level?.name || null,
  };
}

function buildReceiptPdfPayload(payment) {
  const plain = payment.get ? payment.get({ plain: true }) : payment;
  const studentUser = plain.student?.user;
  const parentUser = plain.parent?.user;
  return {
    receiptNumber: plain.receipt_number,
    amount: plain.amount,
    appliedToInvoice: plain.applied_to_invoice,
    excessAmount: plain.excess_amount,
    paymentMethod: plain.payment_method,
    reference: plain.reference,
    paidAt: plain.paid_at,
    notes: plain.notes,
    invoiceNumber: plain.fee_invoice?.invoice_number,
    invoiceBalanceAfter: plain.fee_invoice?.balance,
    studentName: studentUser?.full_name || studentUser?.username || plain.student?.admission_number,
    admissionNumber: plain.student?.admission_number,
    levelName: plain.curriculum_class_level?.name,
    parentName: parentUser?.full_name || parentUser?.username || null,
  };
}

async function loadReceiptPayment(id) {
  return FeePayment.findByPk(id, { include: receiptIncludes });
}

async function assertParentCanAccessReceipt(parent, payment) {
  const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.map(String) : [];
  const linkedByStudent = studentIds.includes(String(payment.student_id));
  const linkedByParent = payment.parent_id && String(payment.parent_id) === String(parent.id);
  if (!linkedByStudent && !linkedByParent) {
    const err = new Error("This receipt is not linked to your account.");
    err.statusCode = 403;
    throw err;
  }
}

function streamReceiptPdf(res, payment) {
  const safeNumber = String(payment.receipt_number || payment.id).replace(/[^a-zA-Z0-9-_]/g, "-");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${safeNumber}.pdf"`);
}

exports.listReceipts = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.parent_id) where.parent_id = req.query.parent_id;
    if (req.query.fee_invoice_id) where.fee_invoice_id = req.query.fee_invoice_id;

    if (req.query.q) {
      const q = String(req.query.q).trim();
      if (q) {
        where[Op.or] = [
          { receipt_number: { [Op.iLike]: `%${q}%` } },
          { reference: { [Op.iLike]: `%${q}%` } },
        ];
      }
    }

    const { count, rows } = await FeePayment.findAndCountAll({
      where,
      include: receiptIncludes,
      order: [["paid_at", "DESC"], ["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map(serializeReceipt),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMyReceipts = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.filter(Boolean) : [];
    const where = {
      [Op.or]: [
        ...(studentIds.length ? [{ student_id: { [Op.in]: studentIds } }] : []),
        { parent_id: parent.id },
      ],
    };
    if (!where[Op.or].length) {
      return res.json({ success: true, data: [] });
    }

    const rows = await FeePayment.findAll({
      where,
      include: receiptIncludes,
      order: [["paid_at", "DESC"], ["created_at", "DESC"]],
      limit: Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100)),
    });

    return res.json({ success: true, data: rows.map(serializeReceipt) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.streamReceiptPdf = async (req, res) => {
  try {
    const payment = await loadReceiptPayment(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }
    const pdf = await buildFeePaymentReceiptPdf(buildReceiptPdfPayload(payment));
    streamReceiptPdf(res, payment);
    return res.send(pdf);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.streamMyReceiptPdf = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const payment = await loadReceiptPayment(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    await assertParentCanAccessReceipt(parent, payment);
    const pdf = await buildFeePaymentReceiptPdf(buildReceiptPdfPayload(payment));
    streamReceiptPdf(res, payment);
    return res.send(pdf);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
