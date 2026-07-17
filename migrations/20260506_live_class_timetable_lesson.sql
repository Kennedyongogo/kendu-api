-- PostgreSQL: link live_classes to curriculum timetable lessons + meeting URLs for Elimu Plus Online.
-- Run once against School_DB (see school_api/.env).

ALTER TABLE live_classes
  ALTER COLUMN meeting_id DROP NOT NULL;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS curriculum_class_timetable_lesson_id UUID REFERENCES curriculum_class_timetable_lessons(id) ON DELETE SET NULL;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS join_url VARCHAR(500);

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS host_url VARCHAR(500);

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS session_status VARCHAR(20) NOT NULL DEFAULT 'scheduled';

ALTER TABLE live_classes
  DROP CONSTRAINT IF EXISTS live_classes_session_status_chk;

ALTER TABLE live_classes
  ADD CONSTRAINT live_classes_session_status_chk
  CHECK (session_status IN ('scheduled', 'live', 'ended', 'cancelled'));

CREATE INDEX IF NOT EXISTS live_classes_timetable_lesson_id_idx ON live_classes(curriculum_class_timetable_lesson_id);
