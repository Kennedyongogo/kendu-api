-- Chat replies + hand raises for live classes

ALTER TABLE live_class_chats
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES live_class_chats(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_live_class_chats_parent_id ON live_class_chats(parent_id);
CREATE INDEX IF NOT EXISTS idx_live_class_chats_live_class_id ON live_class_chats(live_class_id);

CREATE TABLE IF NOT EXISTS live_class_hand_raises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'raised',
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lowered_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT live_class_hand_raises_status_check CHECK (status IN ('raised', 'lowered', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_class_hand_raises_active_user
  ON live_class_hand_raises(live_class_id, user_id)
  WHERE status = 'raised';

CREATE INDEX IF NOT EXISTS idx_live_class_hand_raises_live_class ON live_class_hand_raises(live_class_id);
