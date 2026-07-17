-- Meet-style lobby: waiting → admitted / denied / left

CREATE TABLE IF NOT EXISTS live_class_lobby_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admitted_at TIMESTAMPTZ,
  admitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  denied_at TIMESTAMPTZ,
  denied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT live_class_lobby_entries_status_check
    CHECK (status IN ('waiting', 'admitted', 'denied', 'left'))
);

CREATE INDEX IF NOT EXISTS idx_live_class_lobby_live_class ON live_class_lobby_entries(live_class_id);
CREATE INDEX IF NOT EXISTS idx_live_class_lobby_status ON live_class_lobby_entries(live_class_id, status);
CREATE INDEX IF NOT EXISTS idx_live_class_lobby_user ON live_class_lobby_entries(live_class_id, user_id);
