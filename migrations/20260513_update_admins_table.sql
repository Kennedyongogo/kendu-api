-- PostgreSQL: Update admins table for school admin model changes
-- Remove employee_number, permissions, department, joining_date columns
-- Add profile_picture column

ALTER TABLE admins DROP COLUMN IF EXISTS employee_number;
ALTER TABLE admins DROP COLUMN IF EXISTS permissions;
ALTER TABLE admins DROP COLUMN IF EXISTS department;
ALTER TABLE admins DROP COLUMN IF EXISTS joining_date;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(500);