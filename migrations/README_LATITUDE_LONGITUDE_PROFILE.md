# Add Latitude/Longitude to Marketplace User Profiles

## Overview
Added the ability for marketplace users to capture their XY coordinates (latitude/longitude) in their profile, in addition to the location name fields (country, region, district).

## Changes Made

### 1. Database Model (`marketplaceUserProfile.js`)
- Added `latitude` field: `DECIMAL(10, 8)` - nullable
- Added `longitude` field: `DECIMAL(11, 8)` - nullable
- Added composite index on `(latitude, longitude)` for location-based queries

### 2. Controller (`marketplaceProfileController.js`)
- Updated `completeProfile` function to accept `latitude` and `longitude` from request body
- Added validation:
  - Latitude must be between -90 and 90
  - Longitude must be between -180 and 180
  - Invalid values are silently ignored (set to null)
- Coordinates are parsed as floats and validated before saving

### 3. Database Migration
Created SQL migration script: `add_latitude_longitude_to_marketplace_user_profiles.sql`

## API Usage

### Endpoint: `PUT /api/marketplace/profile/complete`

**Request Body:**
```json
{
  "role": "farmer",
  "fullName": "John Doe",
  "email": "john@example.com",
  "country": "Kenya",
  "region": "Nairobi",
  "district": "Westlands",
  "latitude": "-1.2921",
  "longitude": "36.8219",
  // ... other profile fields
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile completed successfully",
  "data": {
    "id": "...",
    "email": "john@example.com",
    "profile": {
      "country": "Kenya",
      "region": "Nairobi",
      "district": "Westlands",
      "latitude": -1.2921,
      "longitude": 36.8219,
      // ... other profile fields
    }
  }
}
```

## Validation Rules

- **Latitude**: Must be a valid number between -90 and 90
- **Longitude**: Must be a valid number between -180 and 180
- Both fields are optional (nullable)
- Invalid values are ignored and set to `null`
- Empty strings are treated as `null`

## Database Migration Steps

1. **Run the SQL migration:**
   ```bash
   psql -U your_username -d your_database_name -f migrations/add_latitude_longitude_to_marketplace_user_profiles.sql
   ```

2. **Or run manually in psql:**
   ```sql
   ALTER TABLE marketplace_user_profiles 
   ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8) NULL;
   
   ALTER TABLE marketplace_user_profiles 
   ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8) NULL;
   
   CREATE INDEX IF NOT EXISTS idx_marketplace_user_profiles_location 
   ON marketplace_user_profiles(latitude, longitude) 
   WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
   ```

3. **Restart your API server** after running the migration

## Use Cases

This feature enables:
- **Location-based search**: Find users within a certain radius
- **Proximity matching**: Match farmers with nearby buyers/suppliers
- **Map visualization**: Display user locations on maps
- **Distance calculations**: Calculate distances between users
- **Geographic analytics**: Analyze user distribution by location

## Example: Finding Users Near a Location

```javascript
// Example query to find users within 10km radius
const { Op } = require('sequelize');
const radius = 10; // km
const lat = -1.2921;
const lng = 36.8219;

// Rough approximation: 1 degree latitude ≈ 111 km
const latDelta = radius / 111;
const lngDelta = radius / (111 * Math.cos(lat * Math.PI / 180));

const nearbyUsers = await MarketplaceUserProfile.findAll({
  where: {
    latitude: {
      [Op.between]: [lat - latDelta, lat + latDelta]
    },
    longitude: {
      [Op.between]: [lng - lngDelta, lng + lngDelta]
    }
  },
  include: [{ model: MarketplaceUser, as: 'user' }]
});
```

## Notes

- Coordinates are stored as DECIMAL for precision
- The composite index only includes rows where both coordinates are not null (partial index)
- Existing profiles will have `null` values for latitude/longitude until updated
- Frontend should use a map picker component (similar to the one used in Training Events) to allow users to select their location
