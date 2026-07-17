-- Migration: Add latitude and longitude columns to marketplace_user_profiles table
-- Run this SQL script in your PostgreSQL database

-- Add latitude column
ALTER TABLE marketplace_user_profiles 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8) NULL;

-- Add longitude column
ALTER TABLE marketplace_user_profiles 
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8) NULL;

-- Add comment to columns
COMMENT ON COLUMN marketplace_user_profiles.latitude IS 'Latitude coordinate for user location';
COMMENT ON COLUMN marketplace_user_profiles.longitude IS 'Longitude coordinate for user location';

-- Add composite index for location-based queries
CREATE INDEX IF NOT EXISTS idx_marketplace_user_profiles_location 
ON marketplace_user_profiles(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  numeric_precision, 
  numeric_scale,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'marketplace_user_profiles' 
  AND column_name IN ('latitude', 'longitude');
