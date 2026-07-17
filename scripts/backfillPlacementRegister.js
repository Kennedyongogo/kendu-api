/**
 * One-time backfill: admission rows for students with class/term but no register history.
 * Usage: node scripts/backfillPlacementRegister.js
 */
require("dotenv").config();

const { sequelize } = require("../src/models");
const { backfillStudentPlacementRegisters } = require("../src/utils/studentPlacementRegisterService");

async function main() {
  await sequelize.authenticate();
  const result = await backfillStudentPlacementRegisters();
  console.log("Backfill complete:", result);
  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
