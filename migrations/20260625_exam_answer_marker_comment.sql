-- Teacher feedback per marked exam answer (shown to student on results).

ALTER TABLE exam_answers
  ADD COLUMN IF NOT EXISTS marker_comment TEXT;
