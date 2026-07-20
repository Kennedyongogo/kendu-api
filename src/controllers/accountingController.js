const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Programme,
  ProgrammeFee,
  StudentFeeCharge,
  FeePayment,
  FeePaymentAllocation,
} = require("../models");
const mpesa = require("../services/mpesaService");
const { generateFeePaymentReceiptPdf } = require("../services/feeReceiptPdfService");

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function paymentReference(prefix = "FEE") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function ensureStudentCharges(student, transaction) {
  if (
    student.role !== "student" ||
    !student.programme_id ||
    !student.year_of_study ||
    !student.semester
  ) {
    return [];
  }

  const fees = await ProgrammeFee.findAll({
    where: {
      programme_id: student.programme_id,
      [Op.or]: [
        { year_of_study: { [Op.lt]: student.year_of_study } },
        {
          year_of_study: student.year_of_study,
          semester: { [Op.lte]: student.semester },
        },
      ],
    },
    order: [
      ["year_of_study", "ASC"],
      ["semester", "ASC"],
    ],
    transaction,
  });

  for (const fee of fees) {
    await StudentFeeCharge.findOrCreate({
      where: {
        student_id: student.id,
        year_of_study: fee.year_of_study,
        semester: fee.semester,
      },
      defaults: {
        programme_id: student.programme_id,
        programme_fee_id: fee.id,
        description: fee.label || `Year ${fee.year_of_study} Semester ${fee.semester} fees`,
        amount: fee.amount,
        currency: fee.currency || "KES",
      },
      transaction,
    });
  }

  return fees;
}

async function allocateConfirmedPayment(payment, transaction) {
  const existing = await FeePaymentAllocation.count({
    where: { payment_id: payment.id },
    transaction,
  });
  if (existing) return;

  // Lock the charges without a join: Postgres cannot apply FOR UPDATE to the
  // nullable side of an outer join, so allocations are summed in a second query.
  const charges = await StudentFeeCharge.findAll({
    where: { student_id: payment.student_id, status: "active" },
    order: [
      ["year_of_study", "ASC"],
      ["semester", "ASC"],
      ["charged_at", "ASC"],
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!charges.length) return;

  const allocationRows = await FeePaymentAllocation.findAll({
    where: { charge_id: charges.map((charge) => charge.id) },
    attributes: ["charge_id", "amount"],
    transaction,
  });
  const allocatedByCharge = new Map();
  for (const row of allocationRows) {
    allocatedByCharge.set(
      row.charge_id,
      money((allocatedByCharge.get(row.charge_id) || 0) + money(row.amount))
    );
  }

  let remaining = money(payment.amount);
  for (const charge of charges) {
    if (remaining <= 0) break;
    const allocated = allocatedByCharge.get(charge.id) || 0;
    const outstanding = Math.max(0, money(charge.amount) - allocated);
    const amount = Math.min(remaining, outstanding);
    if (amount <= 0) continue;
    await FeePaymentAllocation.create(
      { payment_id: payment.id, charge_id: charge.id, amount },
      { transaction }
    );
    remaining = money(remaining - amount);
  }
}

async function buildLedger(studentId) {
  const student = await User.findByPk(studentId, {
    attributes: [
      "id",
      "full_name",
      "email",
      "phone",
      "admission_number",
      "role",
      "programme_id",
      "year_of_study",
      "semester",
    ],
    include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
  });
  if (!student || student.role !== "student") {
    const error = new Error("Student not found");
    error.status = 404;
    throw error;
  }

  await ensureStudentCharges(student);

  const [charges, payments] = await Promise.all([
    StudentFeeCharge.findAll({
      where: { student_id: studentId, status: "active" },
      include: [
        {
          model: FeePaymentAllocation,
          as: "allocations",
          attributes: ["id", "payment_id", "amount"],
          required: false,
        },
      ],
      order: [
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
      ],
    }),
    FeePayment.findAll({
      where: { student_id: studentId },
      attributes: [
        "id",
        "amount",
        "currency",
        "method",
        "reference",
        "status",
        "phone",
        "provider_receipt",
        "narrative",
        "paid_at",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    }),
  ]);

  const chargeRows = charges.map((charge) => {
    const paid = money(
      charge.allocations.reduce((sum, allocation) => sum + money(allocation.amount), 0)
    );
    const amount = money(charge.amount);
    const balance = Math.max(0, money(amount - paid));
    return {
      id: charge.id,
      year_of_study: charge.year_of_study,
      semester: charge.semester,
      description: charge.description,
      amount,
      paid,
      balance,
      currency: charge.currency,
      status: balance <= 0 ? "paid" : paid > 0 ? "partially_paid" : "unpaid",
      is_current:
        charge.year_of_study === student.year_of_study &&
        charge.semester === student.semester,
      charged_at: charge.charged_at,
    };
  });

  const totalCharged = money(chargeRows.reduce((sum, row) => sum + row.amount, 0));
  const confirmedPaid = money(
    payments
      .filter((payment) => payment.status === "confirmed")
      .reduce((sum, payment) => sum + money(payment.amount), 0)
  );
  const totalPaid = Math.min(totalCharged, confirmedPaid);
  const balance = Math.max(0, money(totalCharged - confirmedPaid));
  const credit = Math.max(0, money(confirmedPaid - totalCharged));
  const arrears = money(
    chargeRows
      .filter((row) => !row.is_current)
      .reduce((sum, row) => sum + row.balance, 0)
  );
  const currentCharge = chargeRows.find((row) => row.is_current) || null;

  return {
    student: student.get({ plain: true }),
    summary: {
      currency: chargeRows[0]?.currency || "KES",
      total_charged: totalCharged,
      total_paid: totalPaid,
      balance,
      arrears,
      credit,
      current_semester_fee: currentCharge?.amount || 0,
      current_semester_paid: currentCharge?.paid || 0,
      current_semester_balance: currentCharge?.balance || 0,
      fee_structure_missing: !currentCharge,
    },
    charges: chargeRows,
    payments: payments.map((payment) => payment.get({ plain: true })),
    online_payment_available: mpesa.configured(),
  };
}

exports.getMyLedger = async (req, res) => {
  try {
    const data = await buildLedger(req.userId);
    return res.json({ success: true, data });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.downloadMyPaymentReceipt = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const payment = await FeePayment.findOne({
      where: {
        id: req.params.paymentId,
        student_id: req.userId,
      },
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    if (payment.status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Receipt is available only for confirmed payments",
      });
    }

    const ledger = await buildLedger(req.userId);
    const pdfBuffer = await generateFeePaymentReceiptPdf({
      payment: payment.get({ plain: true }),
      student: ledger.student,
      summary: ledger.summary,
    });

    const receiptNo = payment.provider_receipt || payment.reference || payment.id;
    const filename = `KASMS-Receipt-${receiptNo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.initiateMyPayment = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }
    const ledger = await buildLedger(req.userId);
    const amount = money(req.body.amount);
    const phone = req.body.phone || req.user.phone;
    if (amount < 1) {
      return res.status(400).json({ success: false, message: "Enter a valid amount" });
    }
    if (ledger.summary.balance <= 0) {
      return res.status(400).json({ success: false, message: "Your fee balance is fully paid" });
    }
    if (amount > ledger.summary.balance) {
      return res.status(400).json({
        success: false,
        message: `Payment cannot exceed the outstanding balance of ${ledger.summary.currency} ${ledger.summary.balance}`,
      });
    }

    const reference = paymentReference("STK");
    const payment = await FeePayment.create({
      student_id: req.userId,
      amount,
      method: "mpesa",
      reference,
      status: "pending",
      phone,
      narrative: "Student portal M-Pesa payment",
    });

    try {
      const result = await mpesa.initiateStkPush({
        phone,
        amount,
        accountReference: req.user.admission_number || reference,
        description: "KASMS school fees",
      });
      await payment.update({
        phone: result.phone,
        provider_request_id: result.CheckoutRequestID,
        provider_payload: result,
      });
      return res.status(202).json({
        success: true,
        message: "Check your phone and enter your M-Pesa PIN",
        data: { payment_id: payment.id, status: payment.status },
      });
    } catch (error) {
      const providerMessage =
        error.response?.data?.errorMessage ||
        error.response?.data?.ResponseDescription ||
        error.message;
      await payment.update({
        status: "failed",
        narrative: providerMessage,
        provider_payload: error.response?.data || null,
      });
      error.message = providerMessage;
      throw error;
    }
  } catch (error) {
    return res
      .status(error.status || error.response?.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.mpesaCallback = async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) {
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  try {
    await sequelize.transaction(async (transaction) => {
      const payment = await FeePayment.findOne({
        where: { provider_request_id: callback.CheckoutRequestID },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!payment || payment.status === "confirmed") return;

      const metadata = Object.fromEntries(
        (callback.CallbackMetadata?.Item || [])
          .filter((item) => item.Name)
          .map((item) => [item.Name, item.Value])
      );

      if (Number(callback.ResultCode) !== 0) {
        await payment.update(
          {
            status: "failed",
            narrative: callback.ResultDesc || "M-Pesa payment failed",
            provider_payload: req.body,
          },
          { transaction }
        );
        return;
      }

      await payment.update(
        {
          status: "confirmed",
          amount: money(metadata.Amount || payment.amount),
          phone: metadata.PhoneNumber ? String(metadata.PhoneNumber) : payment.phone,
          provider_receipt: metadata.MpesaReceiptNumber || null,
          paid_at: metadata.TransactionDate
            ? String(metadata.TransactionDate).replace(
                /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
                "$1-$2-$3T$4:$5:$6+03:00"
              )
            : new Date(),
          narrative: "M-Pesa payment confirmed",
          provider_payload: req.body,
        },
        { transaction }
      );
      await allocateConfirmedPayment(payment, transaction);
    });
  } catch (error) {
    console.error("M-Pesa callback processing failed:", error);
  }

  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
};

exports.getStudentLedger = async (req, res) => {
  try {
    const data = await buildLedger(req.params.studentId);
    return res.json({ success: true, data });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message });
  }
};

exports.listAccountingStudents = async (_req, res) => {
  try {
    const students = await User.findAll({
      where: { role: "student", is_active: true },
      attributes: [
        "id",
        "full_name",
        "admission_number",
        "email",
        "phone",
        "profile_image",
        "programme_id",
        "year_of_study",
        "semester",
      ],
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
      order: [["full_name", "ASC"]],
    });
    return res.json({ success: true, data: students });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const student = await User.findOne({
      where: { id: req.body.student_id, role: "student" },
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const amount = money(req.body.amount);
    if (amount <= 0) {
      return res.status(400).json({ success: false, message: "Enter a valid amount" });
    }
    const method = String(req.body.method || "").toLowerCase();
    if (!["mpesa", "bank", "cash", "card", "other"].includes(method)) {
      return res.status(400).json({ success: false, message: "Select a payment method" });
    }

    await ensureStudentCharges(student);
    const payment = await sequelize.transaction(async (transaction) => {
      const created = await FeePayment.create(
        {
          student_id: student.id,
          amount,
          method,
          reference: String(req.body.reference || "").trim() || paymentReference("MAN"),
          status: "confirmed",
          phone: req.body.phone || null,
          narrative: req.body.narrative || "Payment recorded by accounts office",
          paid_at: req.body.paid_at || new Date(),
          recorded_by: req.userId,
        },
        { transaction }
      );
      await allocateConfirmedPayment(created, transaction);
      return created;
    });

    return res.status(201).json({
      success: true,
      message: "Payment recorded and allocated to the oldest balance",
      data: payment,
    });
  } catch (error) {
    const duplicate = error.name === "SequelizeUniqueConstraintError";
    return res.status(duplicate ? 409 : 500).json({
      success: false,
      message: duplicate ? "That payment reference has already been used" : error.message,
    });
  }
};

exports.listPayments = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const method = String(req.query.method || "").trim();
    const where = {};
    if (status) where.status = status;
    if (method) where.method = method;
    const studentWhere = search
      ? {
          [Op.or]: [
            { full_name: { [Op.iLike]: `%${search}%` } },
            { admission_number: { [Op.iLike]: `%${search}%` } },
          ],
        }
      : undefined;

    const result = await FeePayment.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "full_name", "admission_number", "programme_id"],
          where: studentWhere,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total: result.count,
        pages: Math.ceil(result.count / limit),
        totalPages: Math.max(1, Math.ceil(result.count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

async function ensureAllStudentCharges() {
  if (sequelize.getDialect() === "postgres") {
    await sequelize.query(`
      INSERT INTO student_fee_charges (
        id, student_id, programme_id, programme_fee_id,
        year_of_study, semester, description, amount, currency,
        status, charged_at, created_at, updated_at
      )
      SELECT
        md5(random()::text || clock_timestamp()::text || u.id::text || pf.id::text)::uuid,
        u.id,
        u.programme_id,
        pf.id,
        pf.year_of_study,
        pf.semester,
        COALESCE(
          NULLIF(pf.label, ''),
          'Year ' || pf.year_of_study || ' Semester ' || pf.semester || ' fees'
        ),
        pf.amount,
        pf.currency,
        'active',
        NOW(),
        NOW(),
        NOW()
      FROM users u
      INNER JOIN programme_fees pf
        ON pf.programme_id = u.programme_id
       AND (
         pf.year_of_study < u.year_of_study
         OR (
           pf.year_of_study = u.year_of_study
           AND pf.semester <= u.semester
         )
       )
      WHERE u.role = 'student'
        AND u.is_active = TRUE
        AND u.programme_id IS NOT NULL
        AND u.year_of_study IS NOT NULL
        AND u.semester IS NOT NULL
      ON CONFLICT (student_id, year_of_study, semester) DO NOTHING
    `);
    return;
  }

  const students = await User.findAll({
    where: { role: "student", is_active: true },
    attributes: ["id", "role", "programme_id", "year_of_study", "semester"],
  });
  const batchSize = 20;
  for (let index = 0; index < students.length; index += batchSize) {
    await Promise.all(
      students.slice(index, index + batchSize).map((student) => ensureStudentCharges(student))
    );
  }
}

function collectionPeriod(query) {
  const now = new Date();
  const requestedYear = Number.parseInt(query.year, 10);
  const year =
    requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : now.getFullYear();
  const requestedMonth = Number.parseInt(query.month, 10);
  const month =
    requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : null;
  const start = month
    ? new Date(year, month - 1, 1)
    : new Date(year, 0, 1);
  const end = month
    ? new Date(year, month, 1)
    : new Date(year + 1, 0, 1);
  return { year, month, start, end };
}

async function buildCollectionAnalytics(query) {
  const { year, month, start, end } = collectionPeriod(query);
  const payments = await FeePayment.findAll({
    where: {
      status: "confirmed",
      paid_at: { [Op.gte]: start, [Op.lt]: end },
    },
    attributes: ["amount", "method", "paid_at"],
    raw: true,
  });

  const yearRows = await FeePayment.findAll({
    where: { status: "confirmed", paid_at: { [Op.ne]: null } },
    attributes: [
      [sequelize.fn("DISTINCT", sequelize.fn("DATE_PART", "year", sequelize.col("paid_at"))), "year"],
    ],
    raw: true,
  });
  const availableYears = Array.from(
    new Set([
      new Date().getFullYear(),
      ...yearRows.map((row) => Number(row.year)).filter(Boolean),
    ])
  ).sort((a, b) => b - a);

  const trend = [];
  if (month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      trend.push({ key: String(day), label: String(day), amount: 0 });
    }
  } else {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      trend.push({
        key: String(monthNumber),
        label: new Date(year, monthNumber - 1, 1).toLocaleDateString("en", {
          month: "short",
        }),
        amount: 0,
      });
    }
  }

  const trendMap = new Map(trend.map((period) => [period.key, period]));
  const byMethod = {};
  let periodTotal = 0;
  for (const payment of payments) {
    const date = new Date(payment.paid_at);
    const key = month ? String(date.getDate()) : String(date.getMonth() + 1);
    const period = trendMap.get(key);
    if (period) period.amount = money(period.amount + money(payment.amount));
    byMethod[payment.method] = money(
      (byMethod[payment.method] || 0) + money(payment.amount)
    );
    periodTotal = money(periodTotal + money(payment.amount));
  }

  return {
    collection_trend: trend,
    collection_filter: {
      year,
      month,
      available_years: availableYears,
      period_total: periodTotal,
    },
    by_method: Object.entries(byMethod).map(([method, amount]) => ({
      method,
      amount,
    })),
  };
}

exports.getCollectionAnalytics = async (req, res) => {
  try {
    const data = await buildCollectionAnalytics(req.query);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAccountingDashboard = async (req, res) => {
  try {
    await ensureAllStudentCharges();

    const [billedRaw, receiptsRaw, collectedRaw, studentCount, analytics] =
      await Promise.all([
        StudentFeeCharge.sum("amount", { where: { status: "active" } }),
        FeePayment.sum("amount", { where: { status: "confirmed" } }),
        FeePaymentAllocation.sum("amount"),
        User.count({ where: { role: "student", is_active: true } }),
        buildCollectionAnalytics(req.query),
      ]);

    const billed = money(billedRaw);
    const receipts = money(receiptsRaw);
    const collected = money(collectedRaw);
    const outstanding = Math.max(0, money(billed - collected));
    const collectionRate = billed > 0 ? money((collected / billed) * 100) : 0;

    return res.json({
      success: true,
      data: {
        summary: {
          billed,
          collected,
          outstanding,
          credit: Math.max(0, money(receipts - collected)),
          collection_rate: collectionRate,
          students: studentCount,
        },
        ...analytics,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports.ensureStudentCharges = ensureStudentCharges;
module.exports.allocateConfirmedPayment = allocateConfirmedPayment;
module.exports.buildLedger = buildLedger;
