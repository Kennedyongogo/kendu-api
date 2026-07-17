-- Migration: Add new resource types to audit_trails resource_type enum
-- Run this SQL script in your PostgreSQL database to update the enum type

-- Add new values to the enum_audit_trails_resource_type enum
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_event';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'partner';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_registration';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant_application';

-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE in older versions
-- If you get an error, you can remove IF NOT EXISTS and run each line individually
-- If a value already exists, it will throw an error which you can safely ignore
