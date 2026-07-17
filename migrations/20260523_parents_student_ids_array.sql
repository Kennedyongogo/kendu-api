-- Multiple students per parent profile (UUID array on parents).
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS student_ids UUID[] NOT NULL DEFAULT '{}';

UPDATE parents
SET student_ids = ARRAY[student_id]::UUID[]
WHERE student_id IS NOT NULL
  AND (student_ids IS NULL OR student_ids = '{}');

ALTER TABLE parents DROP COLUMN IF EXISTS student_id;

CREATE INDEX IF NOT EXISTS idx_parents_student_ids ON parents USING GIN (student_ids);
