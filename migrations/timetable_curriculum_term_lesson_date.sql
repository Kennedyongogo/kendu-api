-- Curriculum timetable scoped by curriculum class level (term); lessons by calendar date.
-- Run once on PostgreSQL when upgrading existing installs (sync alter:false does not add columns).

ALTER TABLE curriculum_class_timetables
  ADD COLUMN IF NOT EXISTS curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS curriculum_class_timetables_curriculum_class_level_id_idx
  ON curriculum_class_timetables(curriculum_class_level_id);

-- Lesson calendar dates (model B); weekday/period optional for legacy rows.
ALTER TABLE curriculum_class_timetable_lessons
  ADD COLUMN IF NOT EXISTS lesson_date DATE;

ALTER TABLE curriculum_class_timetable_lessons
  ALTER COLUMN day_of_week DROP NOT NULL;

ALTER TABLE curriculum_class_timetable_lessons
  ALTER COLUMN period_index DROP NOT NULL;

ALTER TABLE curriculum_class_timetable_lessons DROP CONSTRAINT IF EXISTS cctl_timetable_day_period_uniq;

CREATE INDEX IF NOT EXISTS curriculum_class_timetable_lessons_lesson_date_idx
  ON curriculum_class_timetable_lessons(lesson_date);

CREATE INDEX IF NOT EXISTS curriculum_class_timetable_lessons_teacher_lesson_date_idx
  ON curriculum_class_timetable_lessons(teacher_id, lesson_date)
  WHERE teacher_id IS NOT NULL AND lesson_date IS NOT NULL;
