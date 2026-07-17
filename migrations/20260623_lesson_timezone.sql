-- Wall-clock timezone for timetable lessons (matches exam schedule timezone handling)
ALTER TABLE curriculum_class_timetable_lessons
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi';
