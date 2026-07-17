-- Add Sequelize timestamps to live_classes (model uses timestamps: true).

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE live_classes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE live_classes
  SET created_at = COALESCE(start_time, NOW())
  WHERE created_at IS NULL;

UPDATE live_classes
  SET updated_at = COALESCE(end_time, start_time, NOW())
  WHERE updated_at IS NULL;

ALTER TABLE live_classes
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE live_classes
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE live_classes
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE live_classes
  ALTER COLUMN updated_at SET NOT NULL;
