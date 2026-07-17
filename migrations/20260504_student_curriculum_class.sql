-- PostgreSQL: student enrollment via curriculum + curriculum_classes (homeroom teacher resolved in app).
-- Run manually against School_DB before relying on new student fields.

ALTER TABLE students ADD COLUMN IF NOT EXISTS curriculum_id UUID REFERENCES curricula(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS curriculum_class_id UUID REFERENCES curriculum_classes(id) ON DELETE SET NULL;

ALTER TABLE students DROP COLUMN IF EXISTS current_class;
ALTER TABLE students DROP COLUMN IF EXISTS section;
ALTER TABLE students DROP COLUMN IF EXISTS roll_number;

CREATE INDEX IF NOT EXISTS students_curriculum_id_idx ON students(curriculum_id);
CREATE INDEX IF NOT EXISTS students_curriculum_class_id_idx ON students(curriculum_class_id);
