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

async function foreignKeyTarget(table, column) {
  const [rows] = await sequelize.query(
    `
    SELECT ccu.table_name AS foreign_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = :table
      AND kcu.column_name = :column
      AND tc.constraint_type = 'FOREIGN KEY'
    LIMIT 1
  `,
    { replacements: { table, column } }
  );
  return rows[0]?.foreign_table || null;
}

/** Legacy DB reused assignment_submissions with FK to course_assignments instead of assignments. */
async function ensureSubmissionForeignKeys() {
  const cols = await tableColumns("assignment_submissions");
  if (!cols.has("assignment_id")) return;

  const assignmentTarget = await foreignKeyTarget("assignment_submissions", "assignment_id");
  if (assignmentTarget !== "assignments") {
    await sequelize.query(
      `ALTER TABLE assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_assignment_id_fkey`
    );
    await sequelize.query(`
      ALTER TABLE assignment_submissions
        ADD CONSTRAINT assignment_submissions_assignment_id_fkey
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    `);
  }

  if (cols.has("student_id")) {
    const studentTarget = await foreignKeyTarget("assignment_submissions", "student_id");
    if (studentTarget !== "students") {
      await sequelize.query(
        `ALTER TABLE assignment_submissions DROP CONSTRAINT IF EXISTS assignment_submissions_student_id_fkey`
      );
      await sequelize.query(`
        ALTER TABLE assignment_submissions
          ADD CONSTRAINT assignment_submissions_student_id_fkey
          FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      `);
    }
  }
}

/** Align assignment tables with Sequelize models when DB predates migrations. */
async function ensureAssignmentSchema() {
  await addColumnIfMissing(
    "assignments",
    "pdf_template_path",
    `ALTER TABLE assignments ADD COLUMN pdf_template_path TEXT`
  );

  await addColumnIfMissing(
    "assignment_submissions",
    "status",
    `ALTER TABLE assignment_submissions
       ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'draft'`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "started_at",
    `ALTER TABLE assignment_submissions
       ADD COLUMN started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "submitted_at",
    `ALTER TABLE assignment_submissions ADD COLUMN submitted_at TIMESTAMPTZ`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "pdf_answers_json",
    `ALTER TABLE assignment_submissions ADD COLUMN pdf_answers_json JSONB`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "total_score",
    `ALTER TABLE assignment_submissions ADD COLUMN total_score DECIMAL(8, 2)`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "marker_feedback",
    `ALTER TABLE assignment_submissions ADD COLUMN marker_feedback TEXT`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "graded_at",
    `ALTER TABLE assignment_submissions ADD COLUMN graded_at TIMESTAMPTZ`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "graded_by_user_id",
    `ALTER TABLE assignment_submissions
       ADD COLUMN graded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "marks_published",
    `ALTER TABLE assignment_submissions
       ADD COLUMN marks_published BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "created_at",
    `ALTER TABLE assignment_submissions
       ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );
  await addColumnIfMissing(
    "assignment_submissions",
    "updated_at",
    `ALTER TABLE assignment_submissions
       ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  );

  await addColumnIfMissing(
    "assignment_answers",
    "marks_obtained",
    `ALTER TABLE assignment_answers ADD COLUMN marks_obtained DECIMAL(5, 2)`
  );
  await addColumnIfMissing(
    "assignment_answers",
    "marker_comment",
    `ALTER TABLE assignment_answers ADD COLUMN marker_comment TEXT`
  );

  await ensureSubmissionForeignKeys();
}

module.exports = { ensureAssignmentSchema };
