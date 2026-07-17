-- Parent profile links to a student via parents.student_id (set when creating parent profile).
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS student_id UUID NULL REFERENCES students(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_student_id_unique ON parents(student_id)
  WHERE student_id IS NOT NULL;

-- From students.parent_id (if that column was applied earlier)
UPDATE parents p
SET student_id = s.id
FROM students s
WHERE s.parent_id = p.id
  AND p.student_id IS NULL;

-- From student_parents join table
UPDATE parents p
SET student_id = sp.student_id
FROM (
  SELECT DISTINCT ON (sp.parent_id)
    sp.parent_id,
    sp.student_id
  FROM student_parents sp
  ORDER BY sp.parent_id, sp.is_primary_contact DESC, sp.created_at ASC
) sp
WHERE p.id = sp.parent_id
  AND p.student_id IS NULL;

ALTER TABLE students DROP COLUMN IF EXISTS parent_id;
