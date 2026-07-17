const { sequelize } = require("../config/database");

/**
 * Aligns DB with unified exam model (exam_id on lobby, scheduling on exams).
 * Safe to run on every startup — only applies missing changes.
 */
async function ensureUnifiedExamSchema() {
  const q = (sql) => sequelize.query(sql);

  const [lobbyCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_schedule_lobby_entries'
  `);
  const lobbyNames = new Set((lobbyCols || []).map((r) => r.column_name));
  if (lobbyNames.has("exam_schedule_id") && !lobbyNames.has("exam_id")) {
    await q(`ALTER TABLE exam_schedule_lobby_entries RENAME COLUMN exam_schedule_id TO exam_id`);
    await q(
      `ALTER TABLE exam_schedule_lobby_entries DROP CONSTRAINT IF EXISTS exam_schedule_lobby_entries_exam_schedule_id_fkey`
    );
    await q(`
      DO $$ BEGIN
        ALTER TABLE exam_schedule_lobby_entries
          ADD CONSTRAINT exam_schedule_lobby_entries_exam_id_fkey
          FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await q(`DROP INDEX IF EXISTS exam_schedule_lobby_entries_exam_schedule_id_user_id`);
  }

  const [examCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
  `);
  const examNames = new Set((examCols || []).map((r) => r.column_name));
  const addExamCol = async (ddl) => {
    if (examNames.size > 0) await q(ddl);
  };
  if (examNames.size > 0) {
    if (!examNames.has("teacher_id")) await addExamCol(`ALTER TABLE exams ADD COLUMN teacher_id UUID REFERENCES teachers(id)`);
    if (!examNames.has("start_time")) await addExamCol(`ALTER TABLE exams ADD COLUMN start_time TIMESTAMPTZ`);
    if (!examNames.has("end_time")) await addExamCol(`ALTER TABLE exams ADD COLUMN end_time TIMESTAMPTZ`);
    if (!examNames.has("timezone"))
      await addExamCol(`ALTER TABLE exams ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi'`);
    if (!examNames.has("session_status")) await addExamCol(`ALTER TABLE exams ADD COLUMN session_status VARCHAR(32)`);
    if (!examNames.has("is_active"))
      await addExamCol(`ALTER TABLE exams ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true`);
    if (!examNames.has("proctoring_mode"))
      await addExamCol(`ALTER TABLE exams ADD COLUMN proctoring_mode VARCHAR(32) NOT NULL DEFAULT 'record_only'`);
    await q(`
      UPDATE exams SET proctoring_mode = 'record_only'
      WHERE proctoring_mode IS NULL OR proctoring_mode = 'none'
         OR proctoring_mode NOT IN ('record_only', 'live_monitor', 'strict_auto')
    `);
    await q(`UPDATE exams SET requires_webcam = true, prevent_tab_switch = true WHERE proctoring_mode = 'live_monitor'`);
    await q(`UPDATE exams SET requires_webcam = false, prevent_tab_switch = true WHERE proctoring_mode = 'strict_auto'`);
    await q(`UPDATE exams SET requires_webcam = false, prevent_tab_switch = false WHERE proctoring_mode = 'record_only'`);
    await q(`
      UPDATE exams SET proctoring_rules_json = COALESCE(proctoring_rules_json, '{}'::jsonb)
        || '{"exam_access_policy":"paper_plus_room_required"}'::jsonb
      WHERE proctoring_mode = 'live_monitor'
    `);
    await q(`
      UPDATE exams SET proctoring_rules_json = COALESCE(proctoring_rules_json, '{}'::jsonb)
        || '{"exam_access_policy":"paper_only"}'::jsonb
      WHERE proctoring_mode IN ('strict_auto', 'record_only')
    `);
    if (!examNames.has("proctoring_rules_json")) await addExamCol(`ALTER TABLE exams ADD COLUMN proctoring_rules_json JSONB`);
    if (!examNames.has("meeting_provider")) await addExamCol(`ALTER TABLE exams ADD COLUMN meeting_provider VARCHAR(40)`);
    if (!examNames.has("meeting_id")) await addExamCol(`ALTER TABLE exams ADD COLUMN meeting_id VARCHAR(128)`);
    if (!examNames.has("meeting_join_url")) await addExamCol(`ALTER TABLE exams ADD COLUMN meeting_join_url TEXT`);
    if (!examNames.has("meeting_host_url")) await addExamCol(`ALTER TABLE exams ADD COLUMN meeting_host_url TEXT`);
    if (!examNames.has("updated_by")) await addExamCol(`ALTER TABLE exams ADD COLUMN updated_by UUID REFERENCES users(id)`);
    if (!examNames.has("pdf_template_path")) await addExamCol(`ALTER TABLE exams ADD COLUMN pdf_template_path TEXT`);
    if (!examNames.has("pdf_field_schema_json")) await addExamCol(`ALTER TABLE exams ADD COLUMN pdf_field_schema_json JSONB`);
    if (!examNames.has("pdf_answer_key_json")) await addExamCol(`ALTER TABLE exams ADD COLUMN pdf_answer_key_json JSONB`);
    await q(`UPDATE exams SET exam_type = 'questions' WHERE exam_type IS NULL OR TRIM(exam_type) = ''`);
    if (examNames.has("allow_late_join_minutes")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS allow_late_join_minutes`);
    }
    if (examNames.has("max_attempts")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS max_attempts`);
    }
    if (examNames.has("allow_retake")) {
      await q(`ALTER TABLE exams DROP COLUMN IF EXISTS allow_retake`);
    }
    if (!examNames.has("assigned_student_ids")) {
      await addExamCol(`ALTER TABLE exams ADD COLUMN assigned_student_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
    }
  }

  const [subCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_submissions'
  `);
  const subNames = new Set((subCols || []).map((r) => r.column_name));
  if (subNames.size > 0) {
    // Orphan rows block FK sync when exams were deleted but submissions remained.
    await q(`
      DELETE FROM exam_answers
      WHERE submission_id IN (
        SELECT s.id FROM exam_submissions s
        WHERE NOT EXISTS (SELECT 1 FROM exams e WHERE e.id = s.exam_id)
      )
    `);
    await q(`
      DELETE FROM exam_submissions s
      WHERE NOT EXISTS (SELECT 1 FROM exams e WHERE e.id = s.exam_id)
    `);
    if (!subNames.has("pdf_answers_json")) await q(`ALTER TABLE exam_submissions ADD COLUMN pdf_answers_json JSONB`);
    if (!subNames.has("pdf_completed_file_path")) await q(`ALTER TABLE exam_submissions ADD COLUMN pdf_completed_file_path TEXT`);
    if (!subNames.has("pdf_auto_score")) await q(`ALTER TABLE exam_submissions ADD COLUMN pdf_auto_score DECIMAL(8,2)`);
    if (!subNames.has("pdf_auto_grading_json")) await q(`ALTER TABLE exam_submissions ADD COLUMN pdf_auto_grading_json JSONB`);
  }

  const [attemptCols] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_attempts'
  `);
  const attemptNames = new Set((attemptCols || []).map((r) => r.column_name));
  if (attemptNames.has("exam_schedule_id")) {
    await q(`ALTER TABLE exam_attempts DROP COLUMN IF EXISTS exam_schedule_id`);
  }

  const [enumRows] = await sequelize.query(`
    SELECT 1 FROM pg_type WHERE typname = 'enum_exam_session_logs_event_type' LIMIT 1
  `);
  if (enumRows?.length) {
    for (const ev of ["session_presence", "session_submit"]) {
      await q(`
        DO $$ BEGIN
          ALTER TYPE enum_exam_session_logs_event_type ADD VALUE '${ev}';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    }
  }

  await q(`DROP TABLE IF EXISTS exam_schedules CASCADE`);

  // Lobby rows may still hold old schedule UUIDs after rename — clear orphans.
  const [orphanCheck] = await sequelize.query(`
    SELECT COUNT(*)::int AS n FROM exam_schedule_lobby_entries l
    WHERE NOT EXISTS (SELECT 1 FROM exams e WHERE e.id = l.exam_id)
  `);
  const orphanCount = Number(orphanCheck?.[0]?.n ?? 0);
  if (orphanCount > 0) {
    await q(`DELETE FROM exam_schedule_lobby_entries WHERE NOT EXISTS (SELECT 1 FROM exams e WHERE e.id = exam_schedule_lobby_entries.exam_id)`);
  }
}

module.exports = { ensureUnifiedExamSchema };
