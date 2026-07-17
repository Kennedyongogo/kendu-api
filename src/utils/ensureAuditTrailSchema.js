const { sequelize } = require("../config/database");

/**
 * Creates audit_trails table if missing. Safe to run on every API startup.
 */
async function ensureAuditTrailSchema() {
  const q = (sql) => sequelize.query(sql);

  await q(`
    DO $$ BEGIN
      CREATE TYPE enum_audit_trails_status AS ENUM ('success', 'failed', 'pending');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS audit_trails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(40) NOT NULL,
      resource_type VARCHAR(60) NOT NULL DEFAULT 'other',
      resource_id VARCHAR(120),
      description TEXT,
      status enum_audit_trails_status NOT NULL DEFAULT 'success',
      ip_address VARCHAR(64),
      user_agent TEXT,
      old_values JSONB,
      new_values JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_audit_trails_user_id ON audit_trails(user_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_audit_trails_action ON audit_trails(action)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_audit_trails_resource_type ON audit_trails(resource_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_audit_trails_created_at ON audit_trails(created_at DESC)`);
}

module.exports = { ensureAuditTrailSchema };
