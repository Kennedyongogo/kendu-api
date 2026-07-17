-- Report cards for student exam summaries (run if API startup migration did not run yet)

CREATE TABLE IF NOT EXISTS report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  curriculum_id UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  curriculum_class_id UUID NOT NULL REFERENCES curriculum_classes(id) ON DELETE CASCADE,
  curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL,
  title VARCHAR(120),
  total_marks_obtained DECIMAL(8, 2) NOT NULL DEFAULT 0,
  total_marks_possible DECIMAL(8, 2),
  overall_grade VARCHAR(20),
  overall_remarks TEXT,
  pdf_url VARCHAR(500),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_cards ADD COLUMN IF NOT EXISTS curriculum_class_level_id UUID REFERENCES curriculum_class_levels(id) ON DELETE SET NULL;

-- Legacy exam-report schema used semester_id; current app uses curriculum_class_level_id only.
ALTER TABLE report_cards DROP COLUMN IF EXISTS semester_id CASCADE;
ALTER TABLE report_cards DROP COLUMN IF EXISTS academic_term_id CASCADE;
ALTER TABLE report_cards DROP COLUMN IF EXISTS term_id CASCADE;

CREATE INDEX IF NOT EXISTS report_cards_student_id_idx ON report_cards(student_id);
CREATE INDEX IF NOT EXISTS report_cards_curriculum_class_id_idx ON report_cards(curriculum_class_id);

CREATE TABLE IF NOT EXISTS report_card_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_exam_result_id UUID REFERENCES student_exam_results(id) ON DELETE SET NULL,
  exam_title VARCHAR(200) NOT NULL,
  marks_obtained DECIMAL(8, 2),
  total_marks DECIMAL(8, 2),
  grade VARCHAR(20),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_card_lines_report_card_id_idx ON report_card_lines(report_card_id);
