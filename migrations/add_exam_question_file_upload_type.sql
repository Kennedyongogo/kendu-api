-- Run once if exam_questions.question_type ENUM already exists in PostgreSQL:
-- psql -d your_db -f migrations/add_exam_question_file_upload_type.sql

ALTER TYPE "enum_exam_questions_question_type" ADD VALUE IF NOT EXISTS 'file_upload';
