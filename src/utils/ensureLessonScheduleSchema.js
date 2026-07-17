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

/** Adds lesson timezone for wall-clock scheduling (same model as exams). */
async function ensureLessonScheduleSchema() {
  await addColumnIfMissing(
    "curriculum_class_timetable_lessons",
    "timezone",
    `ALTER TABLE curriculum_class_timetable_lessons
       ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi'`
  );
}

module.exports = { ensureLessonScheduleSchema };
