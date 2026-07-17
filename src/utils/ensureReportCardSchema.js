const { sequelize } = require("../config/database");

/** Columns used by the current exam report-card feature (curriculum class level, not semester). */
const REPORT_CARD_COLUMNS = new Set([
  "id",
  "student_id",
  "curriculum_id",
  "curriculum_class_id",
  "curriculum_class_level_id",
  "title",
  "total_marks_obtained",
  "total_marks_possible",
  "overall_grade",
  "overall_remarks",
  "pdf_url",
  "created_by",
  "created_at",
  "updated_at",
]);

const REPORT_CARD_LINE_COLUMNS = new Set([
  "id",
  "report_card_id",
  "exam_id",
  "student_exam_result_id",
  "exam_title",
  "marks_obtained",
  "total_marks",
  "grade",
  "sort_order",
  "created_at",
  "updated_at",
]);

/**
 * Creates report_cards / report_card_lines and adds any missing columns.
 * Drops legacy columns (e.g. semester_id) from older schemas.
 * Safe to run on every API startup.
 */
async function ensureReportCardSchema() {
  const q = (sql) => sequelize.query(sql);

  const dropLegacyColumns = async (tableName, allowed) => {
    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${tableName}'
    `);
    for (const row of cols || []) {
      const name = row.column_name;
      if (!allowed.has(name)) {
        await q(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS "${name}" CASCADE`);
      }
    }
  };

  await q(`
    CREATE TABLE IF NOT EXISTS report_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      curriculum_id UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
      curriculum_class_id UUID NOT NULL REFERENCES curriculum_classes(id) ON DELETE CASCADE,
      curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL,
      title VARCHAR(120),
      total_marks_obtained DECIMAL(8, 2) NOT NULL DEFAULT 0,
      total_marks_possible DECIMAL(8, 2),
      overall_grade VARCHAR(20),
      overall_remarks TEXT,
      pdf_url VARCHAR(500),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const [cardCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report_cards'
  `);
  const cardNames = new Set((cardCols || []).map((r) => r.column_name));

  const addCardCol = async (name, ddl) => {
    if (!cardNames.has(name)) await q(ddl);
  };

  await addCardCol(
    "curriculum_class_level_id",
    `ALTER TABLE report_cards ADD COLUMN curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL`
  );
  await addCardCol("title", `ALTER TABLE report_cards ADD COLUMN title VARCHAR(120)`);
  await addCardCol(
    "total_marks_obtained",
    `ALTER TABLE report_cards ADD COLUMN total_marks_obtained DECIMAL(8, 2) NOT NULL DEFAULT 0`
  );
  await addCardCol("total_marks_possible", `ALTER TABLE report_cards ADD COLUMN total_marks_possible DECIMAL(8, 2)`);
  await addCardCol("overall_grade", `ALTER TABLE report_cards ADD COLUMN overall_grade VARCHAR(20)`);
  await addCardCol("overall_remarks", `ALTER TABLE report_cards ADD COLUMN overall_remarks TEXT`);
  await addCardCol("pdf_url", `ALTER TABLE report_cards ADD COLUMN pdf_url VARCHAR(500)`);
  await addCardCol(
    "created_by",
    `ALTER TABLE report_cards ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL`
  );
  await addCardCol(
    "created_at",
    `ALTER TABLE report_cards ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );
  await addCardCol(
    "updated_at",
    `ALTER TABLE report_cards ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );

  await dropLegacyColumns("report_cards", REPORT_CARD_COLUMNS);

  await q(`CREATE INDEX IF NOT EXISTS report_cards_student_id_idx ON report_cards(student_id)`);
  await q(`CREATE INDEX IF NOT EXISTS report_cards_curriculum_class_id_idx ON report_cards(curriculum_class_id)`);

  await q(`
    CREATE TABLE IF NOT EXISTS report_card_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
      exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_exam_result_id UUID REFERENCES student_exam_results(id) ON DELETE SET NULL,
      exam_title VARCHAR(200) NOT NULL,
      marks_obtained DECIMAL(8, 2),
      total_marks DECIMAL(8, 2),
      grade VARCHAR(20),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const [lineCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report_card_lines'
  `);
  const lineNames = new Set((lineCols || []).map((r) => r.column_name));

  const addLineCol = async (name, ddl) => {
    if (!lineNames.has(name)) await q(ddl);
  };

  await addLineCol(
    "student_exam_result_id",
    `ALTER TABLE report_card_lines ADD COLUMN student_exam_result_id UUID REFERENCES student_exam_results(id) ON DELETE SET NULL`
  );
  await addLineCol("exam_title", `ALTER TABLE report_card_lines ADD COLUMN exam_title VARCHAR(200) NOT NULL DEFAULT 'Exam'`);
  await addLineCol("marks_obtained", `ALTER TABLE report_card_lines ADD COLUMN marks_obtained DECIMAL(8, 2)`);
  await addLineCol("total_marks", `ALTER TABLE report_card_lines ADD COLUMN total_marks DECIMAL(8, 2)`);
  await addLineCol("grade", `ALTER TABLE report_card_lines ADD COLUMN grade VARCHAR(20)`);
  await addLineCol("sort_order", `ALTER TABLE report_card_lines ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);

  await dropLegacyColumns("report_card_lines", REPORT_CARD_LINE_COLUMNS);

  await q(`CREATE INDEX IF NOT EXISTS report_card_lines_report_card_id_idx ON report_card_lines(report_card_id)`);

  // Legacy DBs may have report_card_id FK without ON DELETE CASCADE — fix so deletes work.
  await q(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'report_card_lines'
      ) THEN
        ALTER TABLE report_card_lines
          DROP CONSTRAINT IF EXISTS report_card_lines_report_card_id_fkey;
        ALTER TABLE report_card_lines
          ADD CONSTRAINT report_card_lines_report_card_id_fkey
          FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE;
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

module.exports = { ensureReportCardSchema };
