const { sequelize } = require("../config/database");
const fs = require("fs");
const path = require("path");

async function tableExists(table) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :table LIMIT 1`,
    { replacements: { table } }
  );
  return (rows || []).length > 0;
}

/** Creates lesson attendance register tables if missing. */
async function ensureLessonAttendanceRegisterSchema() {
  if (await tableExists("lesson_attendance_registers")) return;
  const sqlPath = path.join(__dirname, "../../migrations/20260624_lesson_attendance_register.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await sequelize.query(sql);
}

module.exports = { ensureLessonAttendanceRegisterSchema };
