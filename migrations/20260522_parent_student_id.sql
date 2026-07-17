-- Parent profile links to a student via parents.student_id (set when creating parent profile).

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS student_id UUID NULL REFERENCES students(id) ON DELETE CASCADE;

-- If students.parent_id was added earlier, copy into parents.student_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'parent_id'
  ) THEN
    UPDATE parents p
    SET student_id = s.id
    FROM students s
    WHERE s.parent_id = p.id AND p.student_id IS NULL;

    ALTER TABLE students DROP COLUMN IF EXISTS parent_id;
  END IF;
END $$;

-- Backfill from legacy student_parents join table if needed
UPDATE parents p
SET student_id = sub.student_id
FROM (
  SELECT DISTINCT ON (sp.parent_id)
    sp.parent_id,
    sp.student_id
  FROM student_parents sp
  ORDER BY sp.parent_id, sp.is_primary_contact DESC, sp.created_at ASC
) sub
WHERE p.id = sub.parent_id AND p.student_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_student_id_unique ON parents(student_id);
