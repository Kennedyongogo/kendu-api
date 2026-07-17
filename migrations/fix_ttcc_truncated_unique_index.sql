-- Run once if startup failed with:
-- relation "teacher_teaching_curriculum_classes_teacher_id_curriculum_class" already exists
-- (PostgreSQL truncates long index names to 63 chars; Sequelize could collide with itself.)

DROP INDEX IF EXISTS teacher_teaching_curriculum_classes_teacher_id_curriculum_class;

-- If the table was created without a named unique constraint, add the stable name:
CREATE UNIQUE INDEX IF NOT EXISTS ttcc_teacher_curriculum_uniq
  ON teacher_teaching_curriculum_classes (teacher_id, curriculum_class_id);
