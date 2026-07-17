# Audit Trail Enum Migration

## Problem
The audit trail system is trying to log actions for new resource types (`training_event`, `grant`, `partner`, `training_registration`, `grant_application`), but these values are not included in the PostgreSQL enum type `enum_audit_trails_resource_type`.

## Solution
Run the SQL migration script to add the new enum values to your PostgreSQL database.

## Steps to Apply Migration

### Option 1: Using psql Command Line

```bash
# Connect to your database
psql -U your_username -d your_database_name

# Run the migration script
\i migrations/add_training_opportunities_to_audit_enum.sql

# Or copy and paste the SQL commands directly:
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_event';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'partner';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_registration';
ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant_application';
```

### Option 2: Using pgAdmin or Another GUI Tool

1. Open pgAdmin (or your preferred PostgreSQL GUI)
2. Connect to your database
3. Open the Query Tool
4. Copy and paste the contents of `add_training_opportunities_to_audit_enum.sql`
5. Execute the query

### Option 3: Using Node.js/Sequelize Migration

If you're using Sequelize migrations, you can create a migration file:

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new enum values
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_event'"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant'"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'partner'"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'training_registration'"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_audit_trails_resource_type ADD VALUE IF NOT EXISTS 'grant_application'"
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Note: PostgreSQL doesn't support removing enum values easily
    // You would need to recreate the enum type, which is complex
    // This migration is considered irreversible
    throw new Error('Cannot remove enum values in PostgreSQL');
  }
};
```

## Verification

After running the migration, verify that the enum values were added:

```sql
SELECT unnest(enum_range(NULL::enum_audit_trails_resource_type)) AS resource_type;
```

You should see all the new values in the list:
- admin_user
- document
- testimony
- review
- blog
- member
- interest_gallery
- project
- service
- faq
- contact
- system
- training_event ← NEW
- grant ← NEW
- partner ← NEW
- training_registration ← NEW
- grant_application ← NEW
- other

## Important Notes

1. **IF NOT EXISTS**: The migration uses `IF NOT EXISTS` which is available in PostgreSQL 9.5+. If you're using an older version, remove `IF NOT EXISTS` and run each command individually. If a value already exists, PostgreSQL will throw an error which you can safely ignore.

2. **Model Update**: The Sequelize model (`auditTrail.js`) has already been updated to include these new enum values. After running the database migration, restart your API server.

3. **No Data Loss**: This migration only adds new enum values and doesn't modify existing data.

4. **Rollback**: PostgreSQL doesn't support removing enum values easily. If you need to rollback, you would need to recreate the entire enum type, which is a complex operation.

## After Migration

1. Restart your API server
2. Try creating a training event, grant, or partner through the admin portal
3. Check that the audit trail logs are created successfully without errors
