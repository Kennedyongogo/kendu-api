-- Online lesson media expectation: optional (default), audio-only, or video+audio.
ALTER TABLE curriculum_class_timetable_lessons
  ADD COLUMN IF NOT EXISTS media_mode VARCHAR(16) NOT NULL DEFAULT 'optional';

ALTER TABLE curriculum_class_timetable_lessons
  DROP CONSTRAINT IF EXISTS curriculum_class_timetable_lessons_media_mode_chk;

ALTER TABLE curriculum_class_timetable_lessons
  ADD CONSTRAINT curriculum_class_timetable_lessons_media_mode_chk
  CHECK (media_mode IN ('optional', 'audio', 'video'));
