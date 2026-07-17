const { sequelize } = require("../config/database");

async function tableColumns(table) {
  const [cols] = await sequelize.query(
    `
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = :table
  `,
    { replacements: { table } }
  );
  return new Set((cols || []).map((r) => r.column_name));
}

async function addColumnIfMissing(table, column, ddl) {
  const names = await tableColumns(table);
  if (names.size === 0 || names.has(column)) return;
  await sequelize.query(ddl);
}

/**
 * Aligns fee billing tables with the Sequelize models.
 * The production DB may already have older fee_invoices / fee_payments tables.
 */
async function ensureFeeBillingSchema() {
  const q = (sql) => sequelize.query(sql);

  await addColumnIfMissing(
    "students",
    "curriculum_class_level_id",
    `ALTER TABLE students
       ADD COLUMN curriculum_class_level_id UUID
       REFERENCES curriculum_class_levels(id) ON DELETE SET NULL`
  );

  const [examCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
  `);
  const examNames = new Set((examCols || []).map((r) => r.column_name));
  if (examNames.size > 0) {
    if (examNames.has("exam_fee_access_mode")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS exam_fee_access_mode`);
    }
    if (examNames.has("exam_fee_minimum_amount")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS exam_fee_minimum_amount`);
    }
    if (examNames.has("exam_fee_minimum_basis")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS exam_fee_minimum_basis`);
    }
  }

  await q(`
    CREATE TABLE IF NOT EXISTS fee_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number VARCHAR(40) NOT NULL UNIQUE,
      parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      fee_structure_id UUID REFERENCES fee_structures(id) ON DELETE SET NULL,
      curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL,
      fee_snapshot_json JSONB NOT NULL DEFAULT '{}',
      amount_due DECIMAL(12, 2) NOT NULL DEFAULT 0,
      amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
      balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      sent_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS fee_invoices_student_id_idx ON fee_invoices(student_id)`);
  await q(`CREATE INDEX IF NOT EXISTS fee_invoices_parent_id_idx ON fee_invoices(parent_id)`);

  await q(`
    CREATE TABLE IF NOT EXISTS fee_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fee_invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES parents(id) ON DELETE SET NULL,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL,
      amount DECIMAL(12, 2) NOT NULL,
      payment_method VARCHAR(24) NOT NULL DEFAULT 'manual',
      reference VARCHAR(120),
      notes TEXT,
      recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS fee_payments_invoice_id_idx ON fee_payments(fee_invoice_id)`);
  await q(`CREATE INDEX IF NOT EXISTS fee_payments_student_id_idx ON fee_payments(student_id)`);

  for (const table of ["fee_invoices", "fee_payments"]) {
    await addColumnIfMissing(
      table,
      "curriculum_class_level_id",
      `ALTER TABLE ${table} ADD COLUMN curriculum_class_level_id UUID
        REFERENCES curriculum_class_levels(id) ON DELETE SET NULL`
    );
  }

  await addColumnIfMissing(
    "fee_invoices",
    "curriculum_id",
    `ALTER TABLE fee_invoices
       ADD COLUMN curriculum_id UUID
       REFERENCES curricula(id) ON DELETE SET NULL`
  );
  await addColumnIfMissing(
    "fee_invoices",
    "curriculum_class_id",
    `ALTER TABLE fee_invoices
       ADD COLUMN curriculum_class_id UUID
       REFERENCES curriculum_classes(id) ON DELETE SET NULL`
  );
  await addColumnIfMissing(
    "fee_invoices",
    "term_fee_amount",
    `ALTER TABLE fee_invoices ADD COLUMN term_fee_amount NUMERIC(12, 2)`
  );

  const invoiceCols = await tableColumns("fee_invoices");
  if (invoiceCols.size > 0) {
    await sequelize.query(`
      UPDATE fee_invoices fi
      SET
        curriculum_id = COALESCE(fi.curriculum_id, s.curriculum_id),
        curriculum_class_id = COALESCE(fi.curriculum_class_id, s.curriculum_class_id),
        curriculum_class_level_id = COALESCE(fi.curriculum_class_level_id, s.curriculum_class_level_id),
        term_fee_amount = COALESCE(fi.term_fee_amount, fi.amount_due)
      FROM students s
      WHERE fi.student_id = s.id
    `);
  }

  await addColumnIfMissing(
    "fee_payments",
    "applied_to_invoice",
    `ALTER TABLE fee_payments
       ADD COLUMN applied_to_invoice NUMERIC(12, 2) NOT NULL DEFAULT 0`
  );
  await addColumnIfMissing(
    "fee_payments",
    "excess_amount",
    `ALTER TABLE fee_payments
       ADD COLUMN excess_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`
  );

  const paymentCols = await tableColumns("fee_payments");
  if (paymentCols.size > 0 && paymentCols.has("applied_to_invoice")) {
    await sequelize.query(`
      UPDATE fee_payments
      SET applied_to_invoice = amount
      WHERE applied_to_invoice IS NULL OR applied_to_invoice = 0
    `);
  }

  await addColumnIfMissing(
    "fee_payments",
    "receipt_number",
    `ALTER TABLE fee_payments ADD COLUMN receipt_number VARCHAR(40)`
  );
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_receipt_number_unique ON fee_payments(receipt_number) WHERE receipt_number IS NOT NULL`);

  const paymentColsAfter = await tableColumns("fee_payments");
  if (paymentColsAfter.has("receipt_number")) {
    const [missingReceipt] = await sequelize.query(`
      SELECT id FROM fee_payments
      WHERE receipt_number IS NULL OR TRIM(receipt_number) = ''
      LIMIT 500
    `);
    for (const row of missingReceipt || []) {
      const receiptNumber = `RCP-${String(row.id).replace(/-/g, "").toUpperCase().slice(-10)}`;
      await sequelize.query(
        `UPDATE fee_payments SET receipt_number = :receiptNumber WHERE id = :id AND (receipt_number IS NULL OR TRIM(receipt_number) = '')`,
        { replacements: { receiptNumber, id: row.id } }
      );
    }
  }
}

module.exports = { ensureFeeBillingSchema };
