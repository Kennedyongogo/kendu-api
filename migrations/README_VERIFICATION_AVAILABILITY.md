# Migration: Add Verification and Availability Fields

## Overview
This migration adds two important fields to support the Farmers Hub and Veterinary Services features:
1. **`isVerified`** - Verification status for marketplace users
2. **`availability`** - Availability status for farmers

## Changes Made

### 1. MarketplaceUser Model (`marketplaceUser.js`)
**Added Field:**
- `isVerified` (database: `is_verified`)
  - Type: `BOOLEAN`
  - Default: `false`
  - Purpose: Indicates if user is MK-verified (shows verified badge)
  - Indexed for faster filtering

### 2. MarketplaceUserProfile Model (`marketplaceUserProfile.js`)
**Added Field:**
- `availability` (database: `availability`)
  - Type: `ENUM('available', 'pre_order_only', 'unavailable')`
  - Nullable: `true` (optional)
  - Purpose: Availability status for farmers (maps to frontend display)
  - Indexed for faster filtering

## Database Migration Steps

### Option 1: Run SQL Script Directly
```bash
psql -U your_username -d your_database_name -f migrations/add_verification_and_availability_to_marketplace_users.sql
```

### Option 2: Run Manually in psql
```sql
-- Add is_verified to marketplace_users
ALTER TABLE marketplace_users 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_marketplace_users_is_verified 
ON marketplace_users(is_verified) 
WHERE is_verified = true;

-- Create enum type for availability
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_marketplace_user_profiles_availability') THEN
        CREATE TYPE enum_marketplace_user_profiles_availability AS ENUM ('available', 'pre_order_only', 'unavailable');
    END IF;
END$$;

-- Add availability to marketplace_user_profiles
ALTER TABLE marketplace_user_profiles 
ADD COLUMN IF NOT EXISTS availability enum_marketplace_user_profiles_availability NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_user_profiles_availability 
ON marketplace_user_profiles(availability) 
WHERE availability IS NOT NULL;
```

## Usage

### Setting Verification Status (Admin)
```javascript
// Mark user as verified
await MarketplaceUser.update(
  { isVerified: true },
  { where: { id: userId } }
);
```

### Setting Availability (Farmer Profile)
```javascript
// Set farmer availability
await MarketplaceUserProfile.update(
  { availability: 'available' }, // or 'pre_order_only', 'unavailable'
  { where: { userId: farmerId } }
);
```

### Querying Verified Users
```javascript
// Get verified farmers
const verifiedFarmers = await MarketplaceUser.findAll({
  where: {
    role: 'farmer',
    isVerified: true,
    status: 'active',
    profileCompleted: true
  },
  include: [{ model: MarketplaceUserProfile, as: 'profile' }]
});
```

## Frontend Mapping

### Farmers Hub
- `verified` → `user.isVerified`
- `availability` → `profile.availability` (maps to "AVAILABLE", "PRE-ORDER ONLY")

### Veterinary Services
- `verified` → `user.isVerified`
- `specialization` → `profile.roleSpecificData.specialization`

## Notes

1. **Default Values**: 
   - All existing users will have `isVerified = false` by default
   - Existing profiles will have `availability = NULL` (optional field)

2. **Admin Control**: 
   - Only admins should be able to set `isVerified = true`
   - Farmers can update their own `availability` status

3. **Indexes**: 
   - Indexes are created for faster queries when filtering by verification or availability
   - Partial indexes only include rows where values are set (optimized)

4. **Backward Compatibility**: 
   - Both fields are nullable or have defaults, so existing code won't break
   - Frontend should handle `null` values gracefully

## After Migration

1. Restart your API server
2. Update admin controllers to allow setting `isVerified`
3. Update profile completion/update endpoints to handle `availability`
4. Update frontend to fetch and display these fields
