CREATE TABLE IF NOT EXISTS live_class_whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id UUID NOT NULL UNIQUE REFERENCES live_classes(id) ON DELETE CASCADE,
  strokes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_class_whiteboards_live_class_id ON live_class_whiteboards(live_class_id);
