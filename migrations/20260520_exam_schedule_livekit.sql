-- LiveKit exam invigilation: room id + waiting-room lobby
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(128);

CREATE TABLE IF NOT EXISTS exam_schedule_lobby_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  requested_at TIMESTAMPTZ NOT NULL,
  admitted_at TIMESTAMPTZ,
  admitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  denied_at TIMESTAMPTZ,
  denied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exam_schedule_lobby_entries_schedule_user_idx
  ON exam_schedule_lobby_entries (exam_schedule_id, user_id);
