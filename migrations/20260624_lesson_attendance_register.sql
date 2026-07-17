-- Teacher-marked class attendance register per timetable lesson (one register per lesson).

CREATE TABLE IF NOT EXISTS lesson_attendance_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_class_timetable_lesson_id UUID NOT NULL UNIQUE REFERENCES curriculum_class_timetable_lessons(id) ON DELETE CASCADE,
  curriculum_class_id UUID NOT NULL REFERENCES curriculum_classes(id) ON DELETE CASCADE,
  live_class_id UUID REFERENCES live_classes(id) ON DELETE SET NULL,
  hosted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT,
  finalized_at TIMESTAMPTZ,
  finalized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_attendance_registers_class
  ON lesson_attendance_registers (curriculum_class_id);

CREATE TABLE IF NOT EXISTS lesson_attendance_register_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID NOT NULL REFERENCES lesson_attendance_registers(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status VARCHAR(16) CHECK (status IS NULL OR status IN ('present', 'absent', 'late')),
  remarks VARCHAR(500),
  portal_joined BOOLEAN NOT NULL DEFAULT FALSE,
  marked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (register_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_attendance_register_entries_student
  ON lesson_attendance_register_entries (student_id);
