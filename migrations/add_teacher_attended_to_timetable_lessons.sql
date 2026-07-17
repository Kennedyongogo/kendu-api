-- Teacher attendance flag for scheduled timetable lessons (manual confirmation).
ALTER TABLE curriculum_class_timetable_lessons
  ADD COLUMN IF NOT EXISTS teacher_attended BOOLEAN NOT NULL DEFAULT false;
