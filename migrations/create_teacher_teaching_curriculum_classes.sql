-- Classes a teacher teaches (many). Separate from homeroom: teachers.is_class_teacher + class_teacher_curriculum_class_id.

CREATE TABLE IF NOT EXISTS teacher_teaching_curriculum_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  curriculum_class_id UUID NOT NULL REFERENCES curriculum_classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ttcc_teacher_curriculum_uniq UNIQUE (teacher_id, curriculum_class_id)
);

CREATE INDEX IF NOT EXISTS teacher_teaching_curriculum_classes_teacher_idx
  ON teacher_teaching_curriculum_classes (teacher_id);

CREATE INDEX IF NOT EXISTS teacher_teaching_curriculum_classes_class_idx
  ON teacher_teaching_curriculum_classes (curriculum_class_id);
