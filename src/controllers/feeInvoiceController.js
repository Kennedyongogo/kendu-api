const { Op } = require("sequelize");
const {
  sequelize,
  FeeInvoice,
  FeePayment,
  StudentLevelFeeCredit,
  Student,
  Parent,
  User,
  FeeStructure,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
} = require("../models");
const { applyPayment, money: paymentMoney } = require("../services/feePaymentService");
const { buildFeeInvoicePdf } = require("../services/feeInvoicePdf");

const userExclude = { exclude: ["password_hash"] };

const invoiceIncludes = [
  {
    model: Student,
    as: "student",
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
  { model: Curriculum, as: "curriculum", attributes: ["id", "name"], required: false },
  { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name"], required: false },
  { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name", "level_order"] },
  { model: FeeStructure, as: "fee_structure", attributes: ["id", "term_fee_amount", "payment_breakdown"], required: false },
  {
    model: Parent,
    as: "parent",
    required: false,
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
];

const paymentIncludes = [
  {
    model: FeeInvoice,
    as: "fee_invoice",
    attributes: ["id", "invoice_number", "status", "amount_due", "amount_paid", "balance", "term_fee_amount"],
  },
  {
    model: Student,
    as: "student",
    include: [
      { model: User, as: "user", attributes: userExclude },
      {
        model: CurriculumClassLevel,
        as: "curriculum_class_level",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  },
  {
    model: Parent,
    as: "parent",
    required: false,
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
  { model: User, as: "recorded_by_user", attributes: userExclude, required: false },
];

function money(n) {
  return paymentMoney(n);
}

function serializePayment(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  return {
    id: plain.id,
    receipt_number: plain.receipt_number || null,
    amount: money(plain.amount),
    payment_method: plain.payment_method,
    reference: plain.reference || null,
    notes: plain.notes || null,
    paid_at: plain.paid_at,
  };
}

async function loadPaymentsByInvoiceIds(invoiceIds) {
  const map = new Map();
  if (!invoiceIds.length) return map;
  const payments = await FeePayment.findAll({
    where: { fee_invoice_id: { [Op.in]: invoiceIds } },
    attributes: ["id", "fee_invoice_id", "amount", "payment_method", "reference", "notes", "paid_at"],
    order: [["paid_at", "DESC"]],
  });
  for (const payment of payments) {
    const key = String(payment.fee_invoice_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(serializePayment(payment));
  }
  return map;
}

function serializeInvoice(row, creditBalance = 0, payments = []) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  const studentUser = plain.student?.user;
  return {
    ...plain,
    student: plain.student
      ? {
          ...plain.student,
          name: studentUser?.full_name || studentUser?.username || plain.student.admission_number,
        }
      : null,
    level_name: plain.curriculum_class_level?.name || null,
    credit_balance: money(creditBalance),
    payments: Array.isArray(payments) ? payments : [],
  };
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

function buildInvoiceNumber() {
  const t = Date.now().toString(36).toUpperCase();
  return `INV-${t.slice(-8)}`;
}

async function findParentForStudent(studentId) {
  return Parent.findOne({
    where: { student_ids: { [Op.contains]: [studentId] } },
  });
}

/** Active or settled invoice for the same student + term/level (blocks duplicate billing). */
async function findTermLevelInvoice(studentId, levelId, transaction) {
  if (!studentId || !levelId) return null;
  return FeeInvoice.findOne({
    where: {
      student_id: studentId,
      curriculum_class_level_id: levelId,
      status: { [Op.ne]: "cancelled" },
    },
    order: [["created_at", "DESC"]],
    transaction,
  });
}

function duplicateInvoiceMessage(existing) {
  const inv = existing.invoice_number || existing.id;
  if (existing.status === "paid") {
    return `This student already has a paid invoice for this term/level (${inv}). Generate a new invoice only after they move to a new term/level or billing cycle.`;
  }
  const balance = Number(existing.balance || 0).toLocaleString();
  return `An invoice already exists for this student and term/level (${inv}, balance KES ${balance}). Use Record payment for installments or partial payments, or cancel that invoice if it was created in error.`;
}

async function loadStudentForBilling(studentId) {
  return Student.findByPk(studentId, {
    include: [
      { model: User, as: "user", attributes: userExclude },
      { model: Curriculum, as: "curriculum", attributes: ["id", "name"], required: false },
      { model: CurriculumClass, as: "curriculum_class", attributes: ["id", "name", "curriculum_id"], required: false },
      { model: CurriculumClassLevel, as: "curriculum_class_level", attributes: ["id", "name", "curriculum_class_id"], required: false },
    ],
  });
}

async function assertParentCanAccessInvoice(parent, invoice) {
  const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.map(String) : [];
  if (!studentIds.includes(String(invoice.student_id))) {
    const err = new Error("This invoice is not linked to your account.");
    err.statusCode = 403;
    throw err;
  }
}

function buildInvoicePdfPayload(row, creditBalance = 0, payments = []) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  const studentUser = plain.student?.user;
  const parentUser = plain.parent?.user;
  return {
    invoiceNumber: plain.invoice_number,
    studentName: studentUser?.full_name || studentUser?.username || plain.student?.admission_number || "Student",
    admissionNumber: plain.student?.admission_number || "—",
    className: plain.curriculum_class?.name || "—",
    levelName: plain.curriculum_class_level?.name || "—",
    curriculumName: plain.curriculum?.name || "—",
    parentName: parentUser?.full_name || parentUser?.username || null,
    invoiceDate: plain.sent_at || plain.created_at,
    status: plain.status,
    termFeeAmount: plain.term_fee_amount ?? plain.amount_due,
    amountPaid: plain.amount_paid,
    balance: plain.balance,
    creditBalance,
    paymentBreakdown: plain.payment_breakdown,
    notes: plain.notes,
    payments: payments.map((p) => (p.get ? p.get({ plain: true }) : p)),
  };
}

async function loadInvoiceForParentPdf(invoiceId, parent) {
  const invoice = await FeeInvoice.findByPk(invoiceId, { include: invoiceIncludes });
  if (!invoice) return null;
  if (invoice.status === "cancelled") return null;
  await assertParentCanAccessInvoice(parent, invoice);
  const credit = await getLevelCredit(invoice.student_id, invoice.curriculum_class_level_id);
  const payments = await FeePayment.findAll({
    where: { fee_invoice_id: invoice.id },
    order: [["paid_at", "ASC"]],
  });
  return { invoice, credit, payments };
}

exports.streamMyInvoicePdf = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const loaded = await loadInvoiceForParentPdf(req.params.id, parent);
    if (!loaded) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const { invoice, credit, payments } = loaded;
    const pdf = await buildFeeInvoicePdf(buildInvoicePdfPayload(invoice, credit, payments));
    const safeNumber = String(invoice.invoice_number || invoice.id).replace(/[^a-zA-Z0-9-_]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${safeNumber}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const where = {};
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.status) where.status = req.query.status;

    const rows = await FeeInvoice.findAll({
      where,
      include: invoiceIncludes,
      order: [["created_at", "DESC"]],
      limit,
    });

    const data = await Promise.all(
      rows.map(async (row) => {
        const credit = await getLevelCredit(row.student_id, row.curriculum_class_level_id);
        return serializeInvoice(row, credit);
      })
    );

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getInvoice = async (req, res) => {
  try {
    const invoice = await FeeInvoice.findByPk(req.params.id, { include: invoiceIncludes });
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    const credit = await getLevelCredit(invoice.student_id, invoice.curriculum_class_level_id);
    const paymentsByInvoice = await loadPaymentsByInvoiceIds([invoice.id]);
    const payments = paymentsByInvoice.get(String(invoice.id)) || [];
    return res.json({ success: true, data: serializeInvoice(invoice, credit, payments) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listMyInvoices = async (req, res) => {
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }
    const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.filter(Boolean) : [];
    if (!studentIds.length) {
      return res.json({ success: true, data: [] });
    }

    const rows = await FeeInvoice.findAll({
      where: {
        student_id: { [Op.in]: studentIds },
        status: { [Op.ne]: "cancelled" },
      },
      include: invoiceIncludes,
      order: [["created_at", "DESC"]],
    });

    const paymentsByInvoice = await loadPaymentsByInvoiceIds(rows.map((row) => row.id));

    const data = await Promise.all(
      rows.map(async (row) => {
        const credit = await getLevelCredit(row.student_id, row.curriculum_class_level_id);
        const payments = paymentsByInvoice.get(String(row.id)) || [];
        return serializeInvoice(row, credit, payments);
      })
    );

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateInvoice = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { student_id, send_to_parent, notes } = req.body || {};
    if (!student_id) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "student_id is required" });
    }

    const student = await loadStudentForBilling(student_id);
    if (!student) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const levelId = student.curriculum_class_level_id;
    const classId = student.curriculum_class_id;
    const curriculumId = student.curriculum_id;

    if (!levelId || !classId || !curriculumId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Student must have curriculum, class, and term/level set before generating an invoice.",
      });
    }

    const feeStructure = await FeeStructure.findOne({
      where: {
        curriculum_id: curriculumId,
        curriculum_class_id: classId,
        curriculum_class_level_id: levelId,
      },
      transaction,
    });

    if (!feeStructure) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No fee structure found for this student's curriculum, class, and term/level.",
      });
    }

    const existing = await findTermLevelInvoice(student.id, levelId, transaction);
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: duplicateInvoiceMessage(existing),
        existing_invoice_id: existing.id,
        existing_invoice_number: existing.invoice_number,
        existing_status: existing.status,
      });
    }

    const termFee = money(feeStructure.term_fee_amount);
    let parent = null;
    if (send_to_parent) {
      parent = await findParentForStudent(student.id);
    }

    const invoice = await FeeInvoice.create(
      {
        invoice_number: buildInvoiceNumber(),
        student_id: student.id,
        parent_id: parent?.id || null,
        curriculum_id: curriculumId,
        curriculum_class_id: classId,
        curriculum_class_level_id: levelId,
        fee_structure_id: feeStructure.id,
        term_fee_amount: termFee,
        amount_due: termFee,
        amount_paid: 0,
        balance: termFee,
        payment_breakdown: feeStructure.payment_breakdown,
        status: send_to_parent ? "sent" : "draft",
        notes: notes?.trim() || null,
        sent_at: send_to_parent ? new Date() : null,
      },
      { transaction }
    );

    await transaction.commit();

    const created = await FeeInvoice.findByPk(invoice.id, { include: invoiceIncludes });
    const credit = await getLevelCredit(created.student_id, created.curriculum_class_level_id);
    return res.status(201).json({ success: true, data: serializeInvoice(created, credit) });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.cancelInvoice = async (req, res) => {
  try {
    const invoice = await FeeInvoice.findByPk(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    if (invoice.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Invoice is already cancelled." });
    }
    if (invoice.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a fully paid invoice. The term/level has already been settled.",
      });
    }
    if (Number(invoice.amount_paid) > 0.01) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel an invoice that already has payments recorded.",
      });
    }

    const reason = String(req.body?.reason || "").trim();
    const noteLine = reason ? `Cancelled: ${reason}` : "Cancelled by staff";
    const notes = invoice.notes ? `${invoice.notes}\n${noteLine}` : noteLine;

    await invoice.update({ status: "cancelled", notes });
    return res.json({ success: true, data: invoice });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.recordInvoicePayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const invoice = await FeeInvoice.findByPk(req.params.id, { transaction });
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    if (invoice.status === "cancelled") {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Cannot pay a cancelled invoice." });
    }
    if (invoice.status === "paid") {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Invoice is already fully paid." });
    }

    const result = await applyPayment({
      invoice,
      amount: req.body?.amount,
      paymentMethod: req.body?.payment_method || "manual",
      reference: req.body?.reference,
      notes: req.body?.notes,
      recordedByUserId: req.user.id,
      transaction,
    });

    await transaction.commit();
    return res.json({ success: true, data: result });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.recordMyInvoicePayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const parent = await Parent.findOne({ where: { user_id: req.user.id }, transaction });
    if (!parent) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const invoice = await FeeInvoice.findByPk(req.params.id, { transaction });
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const studentIds = Array.isArray(parent.student_ids) ? parent.student_ids.map(String) : [];
    if (!studentIds.includes(String(invoice.student_id))) {
      await transaction.rollback();
      return res.status(403).json({ success: false, message: "This invoice is not linked to your account." });
    }

    const result = await applyPayment({
      invoice,
      amount: req.body?.amount,
      paymentMethod: req.body?.payment_method || "portal",
      reference: req.body?.reference,
      notes: req.body?.notes,
      parentId: parent.id,
      transaction,
    });

    await transaction.commit();
    return res.json({ success: true, data: result });
  } catch (error) {
    await transaction.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.listPayments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { count, rows } = await FeePayment.findAndCountAll({
      include: paymentIncludes,
      order: [["paid_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPayment = async (req, res) => {
  try {
    const row = await FeePayment.findByPk(req.params.id, { include: paymentIncludes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

