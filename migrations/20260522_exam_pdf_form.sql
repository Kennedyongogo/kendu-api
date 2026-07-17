-- Fillable PDF exam support (also applied via ensureUnifiedExamSchema on startup)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pdf_template_path TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pdf_field_schema_json JSONB;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pdf_answer_key_json JSONB;
UPDATE exams SET exam_type = 'questions' WHERE exam_type IS NULL OR TRIM(exam_type) = '';

ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS pdf_answers_json JSONB;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS pdf_completed_file_path TEXT;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS pdf_auto_score DECIMAL(8,2);
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS pdf_auto_grading_json JSONB;
