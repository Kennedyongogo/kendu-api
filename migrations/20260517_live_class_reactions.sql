-- Ephemeral-style reactions, persisted for reload / late joiners (recent window only)

CREATE TABLE IF NOT EXISTS live_class_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_class_reactions_live_class_created
  ON live_class_reactions(live_class_id, created_at DESC);
