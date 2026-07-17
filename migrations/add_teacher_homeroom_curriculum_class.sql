-- Single homeroom (class teacher) per teacher: boolean + FK to curriculum_classes.
-- Run against your school DB if columns are missing (Sequelize sync with alter:false does not add them).

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS is_class_teacher BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS class_teacher_curriculum_class_id UUID REFERENCES curriculum_classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teachers_class_teacher_curriculum_class_id_idx
  ON teachers (class_teacher_curriculum_class_id)
  WHERE class_teacher_curriculum_class_id IS NOT NULL;

-- At most one teacher may be homeroom class teacher per curriculum class.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_homeroom_curriculum_class_uniq
  ON teachers (class_teacher_curriculum_class_id)
  WHERE class_teacher_curriculum_class_id IS NOT NULL;
