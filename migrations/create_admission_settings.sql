-- Singleton settings for the public Apply for admission window.
CREATE TABLE IF NOT EXISTS admission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(40) NOT NULL UNIQUE DEFAULT 'default',
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  closed_message TEXT NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admission_settings
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

INSERT INTO admission_settings (id, key, is_enabled, closed_message, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'default',
  FALSE,
  'Admissions are currently closed. Please check back during the next intake window.',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;
