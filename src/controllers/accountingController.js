const { Op, fn, col, literal } = require("sequelize");
const {
  FeeStructure,
  FeeInvoice,
  FeePayment,
  CurriculumClass,
  Curriculum,
} = require("../models");

function money(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Number.parseFloat(n.toFixed(2)) : 0;
}

const ALL_STATUSES = ["draft", "sent", "partial", "paid", "cancelled"];

const STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

function monthLabel(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function monthParts(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return { year: null, month: null };
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * GET /api/accounting/stats
 * Summary counts, monthly collections (all time, filterable by curriculum/class/year/month),
 * invoice status pie chart, outstanding balance by class bar chart.
 */
exports.getStats = async (req, res) => {
  try {
    const [
      feeStructuresCount,
      invoicesCount,
      activeInvoicesCount,
      paymentsCount,
      receiptsCount,
      collectedSum,
      outstandingSum,
      termFeeBilledSum,
      statusRows,
      collectionBreakdownRows,
      outstandingDetailRows,
      latestPayment,
      curricula,
      allClasses,
    ] = await Promise.all([
      FeeStructure.count(),
      FeeInvoice.count(),
      FeeInvoice.count({ where: { status: { [Op.ne]: "cancelled" } } }),
      FeePayment.count(),
      FeePayment.count({ where: { receipt_number: { [Op.ne]: null } } }),
      FeePayment.sum("amount"),
      FeeInvoice.sum("balance", {
        where: { status: { [Op.notIn]: ["cancelled", "paid"] } },
      }),
      FeeInvoice.sum("term_fee_amount", {
        where: { status: { [Op.ne]: "cancelled" } },
      }),
      FeeInvoice.findAll({
        attributes: ["status", [fn("COUNT", col("id")), "invoice_count"]],
        group: ["status"],
        raw: true,
      }),
      FeePayment.findAll({
        attributes: [
          [fn("DATE_TRUNC", "month", col("FeePayment.paid_at")), "month_start"],
          [col("fee_invoice.curriculum_id"), "curriculum_id"],
          [col("fee_invoice.curriculum_class_id"), "curriculum_class_id"],
          [fn("SUM", col("FeePayment.amount")), "collected"],
          [fn("COUNT", col("FeePayment.id")), "payment_count"],
        ],
        include: [
          {
            model: FeeInvoice,
            as: "fee_invoice",
            attributes: [],
            required: false,
          },
        ],
        group: [
          fn("DATE_TRUNC", "month", col("FeePayment.paid_at")),
          col("fee_invoice.curriculum_id"),
          col("fee_invoice.curriculum_class_id"),
        ],
        order: [[fn("DATE_TRUNC", "month", col("FeePayment.paid_at")), "ASC"]],
        raw: true,
        subQuery: false,
      }),
      FeeInvoice.findAll({
        attributes: [
          "curriculum_id",
          "curriculum_class_id",
          [literal('EXTRACT(YEAR FROM "FeeInvoice"."created_at")'), "year"],
          [literal('EXTRACT(MONTH FROM "FeeInvoice"."created_at")'), "month"],
          [fn("SUM", col("balance")), "outstanding"],
          [fn("COUNT", col("id")), "invoice_count"],
        ],
        where: {
          status: { [Op.notIn]: ["cancelled", "paid"] },
          balance: { [Op.gt]: 0 },
        },
        group: [
          "curriculum_id",
          "curriculum_class_id",
          literal('EXTRACT(YEAR FROM "FeeInvoice"."created_at")'),
          literal('EXTRACT(MONTH FROM "FeeInvoice"."created_at")'),
        ],
        raw: true,
      }),
      FeePayment.findOne({
        attributes: ["paid_at"],
        order: [["paid_at", "DESC"]],
        raw: true,
      }),
      Curriculum.findAll({
        attributes: ["id", "name", "type"],
        order: [["name", "ASC"]],
      }),
      CurriculumClass.findAll({
        attributes: ["id", "name", "code", "curriculum_id"],
        include: [
          {
            model: Curriculum,
            as: "curriculum",
            attributes: ["id", "name", "type"],
            required: false,
          },
        ],
        order: [["name", "ASC"]],
      }),
    ]);

    const countByStatus = new Map(
      statusRows.map((row) => [row.status, Number(row.invoice_count) || 0])
    );

    const invoicesByStatus = ALL_STATUSES.map((status, index) => ({
      status,
      label: STATUS_LABELS[status],
      invoice_count: countByStatus.get(status) || 0,
      color_index: index,
    }));

    const pieSeries = invoicesByStatus.map((row) => ({
      name: row.label,
      value: row.invoice_count,
      status: row.status,
      color_index: row.color_index,
    }));

    const collectionsBreakdown = collectionBreakdownRows.map((row) => {
      const parts = monthParts(row.month_start);
      return {
        month_start: row.month_start,
        year: parts.year,
        month: parts.month,
        label: monthLabel(row.month_start),
        curriculum_id: row.curriculum_id || null,
        curriculum_class_id: row.curriculum_class_id || null,
        collected: money(row.collected),
        payment_count: Number(row.payment_count) || 0,
      };
    });

    const collectionsByMonthMap = new Map();
    for (const row of collectionsBreakdown) {
      const key = String(row.month_start);
      const existing = collectionsByMonthMap.get(key) || {
        month_start: row.month_start,
        year: row.year,
        month: row.month,
        label: row.label,
        collected: 0,
        payment_count: 0,
      };
      existing.collected = money(existing.collected + row.collected);
      existing.payment_count += row.payment_count;
      collectionsByMonthMap.set(key, existing);
    }

    const collectionsByMonth = [...collectionsByMonthMap.values()].sort(
      (a, b) => new Date(a.month_start) - new Date(b.month_start)
    );

    const classLabelMap = new Map(
      allClasses.map((c) => {
        const plain = c.get({ plain: true });
        const curriculumLabel = plain.curriculum?.type || plain.curriculum?.name || "";
        const classLabel = plain.name || plain.code || "Class";
        return [
          String(plain.id),
          {
            class_id: plain.id,
            class_name: classLabel,
            curriculum_id: plain.curriculum_id || plain.curriculum?.id || null,
            curriculum_name: plain.curriculum?.name || null,
            label: curriculumLabel ? `${classLabel} (${curriculumLabel})` : classLabel,
          },
        ];
      })
    );

    const outstandingBreakdown = outstandingDetailRows.map((row) => {
      const classId = row.curriculum_class_id || null;
      const meta = classId ? classLabelMap.get(String(classId)) : null;
      return {
        curriculum_id: row.curriculum_id || null,
        curriculum_class_id: classId,
        class_id: classId,
        year: row.year != null ? Number(row.year) : null,
        month: row.month != null ? Number(row.month) : null,
        class_name: meta?.class_name || (classId ? "Class" : "Unassigned"),
        label: meta?.label || (classId ? "Class" : "Unassigned"),
        outstanding: money(row.outstanding),
        invoice_count: Number(row.invoice_count) || 0,
      };
    });

    const outstandingByClassMap = new Map();
    for (const row of outstandingBreakdown) {
      const key = row.class_id != null ? String(row.class_id) : "__unassigned__";
      const existing = outstandingByClassMap.get(key) || {
        class_id: row.class_id,
        class_name: row.class_name,
        curriculum_id: row.curriculum_id,
        curriculum_name: null,
        label: row.label,
        outstanding: 0,
        invoice_count: 0,
      };
      existing.outstanding = money(existing.outstanding + row.outstanding);
      existing.invoice_count += row.invoice_count;
      outstandingByClassMap.set(key, existing);
    }

    const outstandingByClass = [...outstandingByClassMap.values()].sort(
      (a, b) => b.outstanding - a.outstanding
    );

    const curriculumOptions = curricula.map((c) => {
      const plain = c.get({ plain: true });
      return {
        id: plain.id,
        name: plain.name,
        type: plain.type || null,
        label: plain.name || plain.type || "Curriculum",
      };
    });

    const classOptions = allClasses.map((c) => {
      const plain = c.get({ plain: true });
      const curriculumLabel = plain.curriculum?.type || plain.curriculum?.name || "";
      const classLabel = plain.name || plain.code || "Class";
      return {
        id: plain.id,
        curriculum_id: plain.curriculum_id || plain.curriculum?.id || null,
        name: classLabel,
        label: curriculumLabel ? `${classLabel} (${curriculumLabel})` : classLabel,
      };
    });

    const collectionYears = [
      ...new Set(collectionsBreakdown.map((row) => row.year).filter(Boolean)),
    ].sort((a, b) => a - b);

    const outstandingYears = [
      ...new Set(outstandingBreakdown.map((row) => row.year).filter(Boolean)),
    ].sort((a, b) => a - b);

    return res.json({
      success: true,
      data: {
        counts: {
          fee_structures: feeStructuresCount,
          invoices: invoicesCount,
          active_invoices: activeInvoicesCount,
          payments: paymentsCount,
          receipts: receiptsCount,
          total_collected: money(collectedSum),
          outstanding_balance: money(outstandingSum),
          term_fee_billed: money(termFeeBilledSum),
          latest_payment_at: latestPayment?.paid_at || null,
        },
        invoices_by_status: invoicesByStatus,
        collections_breakdown: collectionsBreakdown,
        collections_by_month: collectionsByMonth,
        collection_years: collectionYears,
        outstanding_breakdown: outstandingBreakdown,
        outstanding_years: outstandingYears,
        curricula: curriculumOptions,
        classes: classOptions,
        outstanding_by_class: outstandingByClass,
        bar_chart: {
          x_axis: "month",
          y_axis: "collected",
          series: collectionsByMonth.map((row) => ({
            x: row.label,
            y: row.collected,
            month_start: row.month_start,
            year: row.year,
            month: row.month,
            payment_count: row.payment_count,
          })),
        },
        outstanding_bar_chart: {
          x_axis: "class",
          y_axis: "outstanding",
          series: outstandingByClass.map((row) => ({
            x: row.label,
            y: row.outstanding,
            class_id: row.class_id,
            curriculum_id: row.curriculum_id,
            invoice_count: row.invoice_count,
          })),
        },
        pie_chart: {
          dimension: "invoice_status",
          value: "invoice_count",
          series: pieSeries,
        },
      },
    });
  } catch (err) {
    console.error("accounting getStats:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load accounting stats.",
      error: err.message,
    });
  }
};
