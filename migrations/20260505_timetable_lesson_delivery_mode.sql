-- PostgreSQL: lesson delivery mode (physical classroom vs online).

ALTER TABLE curriculum_class_timetable_lessons
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16) NOT NULL DEFAULT 'physical';

ALTER TABLE curriculum_class_timetable_lessons
  DROP CONSTRAINT IF EXISTS curriculum_class_timetable_lessons_delivery_mode_chk;

ALTER TABLE curriculum_class_timetable_lessons
  ADD CONSTRAINT curriculum_class_timetable_lessons_delivery_mode_chk
  CHECK (delivery_mode IN ('physical', 'online'));
