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

/** Adds marker_comment to exam_answers when missing. */
async function ensureExamAnswerMarkerCommentSchema() {
  const names = await tableColumns("exam_answers");
  if (names.size === 0 || names.has("marker_comment")) return;
  await sequelize.query(`ALTER TABLE exam_answers ADD COLUMN marker_comment TEXT`);
}

module.exports = { ensureExamAnswerMarkerCommentSchema };
