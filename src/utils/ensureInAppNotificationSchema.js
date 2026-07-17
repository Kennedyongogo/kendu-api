const { sequelize } = require("../config/database");

async function ensureInAppNotificationSchema() {
  const [tables] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'in_app_notifications'
    LIMIT 1
  `);
  if (!tables?.length) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'info',
        action_url VARCHAR(500),
        is_read BOOLEAN NOT NULL DEFAULT false,
        read_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS in_app_notifications_user_id_idx ON in_app_notifications(user_id)
    `);
  }
}

module.exports = { ensureInAppNotificationSchema };
