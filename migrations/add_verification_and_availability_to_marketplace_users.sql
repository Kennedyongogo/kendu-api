-- Migration: Add isVerified and availability columns to marketplace users
-- Run this SQL script in your PostgreSQL database

-- 1. Add is_verified column to marketplace_users table
ALTER TABLE marketplace_users 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN marketplace_users.is_verified IS 'Whether the user is MK-verified (for display in Farmers Hub and Veterinary Services)';

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_users_is_verified 
ON marketplace_users(is_verified) 
WHERE is_verified = true;

-- 2. Add availability column to marketplace_user_profiles table
-- First, create the enum type if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_marketplace_user_profiles_availability') THEN
        CREATE TYPE enum_marketplace_user_profiles_availability AS ENUM ('available', 'pre_order_only', 'unavailable');
    END IF;
END$$;

-- Add the column
ALTER TABLE marketplace_user_profiles 
ADD COLUMN IF NOT EXISTS availability enum_marketplace_user_profiles_availability NULL;

-- Add comment
COMMENT ON COLUMN marketplace_user_profiles.availability IS 'Availability status for farmers (e.g., AVAILABLE, PRE-ORDER ONLY)';

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_user_profiles_availability 
ON marketplace_user_profiles(availability) 
WHERE availability IS NOT NULL;

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'marketplace_users' 
  AND column_name = 'is_verified';

SELECT 
  column_name, 
  data_type, 
  udt_name,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'marketplace_user_profiles' 
  AND column_name = 'availability';
