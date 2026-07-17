-- Add proctoring event types used by monitored/strict exams (PostgreSQL enum).
DO $$ BEGIN
  ALTER TYPE enum_exam_session_logs_event_type ADD VALUE 'session_presence';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE enum_exam_session_logs_event_type ADD VALUE 'session_submit';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
