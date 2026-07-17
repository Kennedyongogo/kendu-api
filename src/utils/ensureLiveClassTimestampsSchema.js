const { sequelize } = require("../config/database");

async function tableColumns(table) {
  const [cols] = await sequelize.query(
    `
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = :table
  `,
    { replacements: { table } }
  );
  return new Set((cols || []).map((r) => r.column_name));
}

async function addColumnIfMissing(table, column, ddl) {
  const names = await tableColumns(table);
  if (names.size === 0 || names.has(column)) return;
  await sequelize.query(ddl);
}

/** Adds created_at / updated_at to live_classes when missing. */
async function ensureLiveClassTimestampsSchema() {
  await addColumnIfMissing(
    "live_classes",
    "created_at",
    `ALTER TABLE live_classes ADD COLUMN created_at TIMESTAMPTZ`
  );
  await addColumnIfMissing(
    "live_classes",
    "updated_at",
    `ALTER TABLE live_classes ADD COLUMN updated_at TIMESTAMPTZ`
  );

  const names = await tableColumns("live_classes");
  if (!names.has("created_at") && !names.has("updated_at")) return;

  await sequelize.query(`
    UPDATE live_classes SET created_at = COALESCE(start_time, NOW()) WHERE created_at IS NULL
  `);
  await sequelize.query(`
    UPDATE live_classes SET updated_at = COALESCE(end_time, start_time, NOW()) WHERE updated_at IS NULL
  `);
  await sequelize.query(`ALTER TABLE live_classes ALTER COLUMN created_at SET DEFAULT NOW()`);
  await sequelize.query(`ALTER TABLE live_classes ALTER COLUMN updated_at SET DEFAULT NOW()`);

  const after = await tableColumns("live_classes");
  if (after.has("created_at")) {
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE live_classes ALTER COLUMN created_at SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);
  }
  if (after.has("updated_at")) {
    await sequelize.query(`
      DO $$ BEGIN
        ALTER TABLE live_classes ALTER COLUMN updated_at SET NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);
  }
}

module.exports = { ensureLiveClassTimestampsSchema };
