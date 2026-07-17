-- Migration: Add address, sector, services, featured to partners table
-- Run this SQL script in your database so Create/Edit Partner in admin persist all form fields.

-- Add address column
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS address VARCHAR(500) NULL;

-- Add sector column
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS sector VARCHAR(200) NULL;

-- Add services column (JSON array stored as TEXT)
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS services TEXT NULL;

-- Add featured column
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

-- Optional: comments for documentation
COMMENT ON COLUMN partners.address IS 'Partner organization address';
COMMENT ON COLUMN partners.sector IS 'e.g. Agriculture, Technology, Finance';
COMMENT ON COLUMN partners.services IS 'JSON array of service strings';
COMMENT ON COLUMN partners.featured IS 'Whether the partner is featured';
