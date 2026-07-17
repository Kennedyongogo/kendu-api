const { sequelize } = require("../config/database");

/**
 * Adds admission workflow columns and normalizes legacy status values.
 * Safe to run on every API startup.
 */
async function ensureAdmissionApplicationSchema() {
  const q = (sql) => sequelize.query(sql);

  await q(`
    UPDATE admission_applications
    SET status = 'pending'
    WHERE status IN ('under_review', 'documents_verified', 'waitlisted')
  `);

  await q(`
    DO $$ BEGIN
      ALTER TABLE admission_applications
        ALTER COLUMN status TYPE VARCHAR(30) USING status::text;
    EXCEPTION
      WHEN others THEN NULL;
    END $$;
  `);

  await q(`
    ALTER TABLE admission_applications
      ADD COLUMN IF NOT EXISTS interview_date TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS acceptance_notes TEXT,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS notification_status VARCHAR(24) DEFAULT 'pending'
  `);
}

module.exports = { ensureAdmissionApplicationSchema };
