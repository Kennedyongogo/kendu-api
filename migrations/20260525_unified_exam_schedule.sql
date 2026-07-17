-- Unified exam model: scheduling columns on exams, drop exam_schedules.
-- Run once before deploying API changes. Truncates all exam data.

BEGIN;

TRUNCATE TABLE
  exam_schedule_lobby_entries,
  exam_session_logs,
  exam_answers,
  exam_submissions,
  exam_attempts,
  student_exam_results,
  proctoring_recordings,
  proctoring_events,
  proctoring_sessions,
  exam_questions,
  exam_schedules,
  exams
RESTART IDENTITY CASCADE;

DROP TABLE IF EXISTS exam_schedules CASCADE;

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id),
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS session_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_late_join_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS proctoring_mode VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proctoring_rules_json JSONB,
  ADD COLUMN IF NOT EXISTS meeting_provider VARCHAR(40),
  ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS meeting_join_url TEXT,
  ADD COLUMN IF NOT EXISTS meeting_host_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

ALTER TABLE exam_attempts DROP COLUMN IF EXISTS exam_schedule_id;

ALTER TABLE exam_schedule_lobby_entries
  RENAME COLUMN exam_schedule_id TO exam_id;

ALTER TABLE exam_schedule_lobby_entries
  DROP CONSTRAINT IF EXISTS exam_schedule_lobby_entries_exam_schedule_id_fkey;

ALTER TABLE exam_schedule_lobby_entries
  ADD CONSTRAINT exam_schedule_lobby_entries_exam_id_fkey
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS exam_schedule_lobby_entries_exam_schedule_id_user_id;
CREATE INDEX IF NOT EXISTS exam_schedule_lobby_entries_exam_id_user_id
  ON exam_schedule_lobby_entries (exam_id, user_id);

COMMIT;
