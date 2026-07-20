/**
 * Seed academic departments for Kendu.
 *
 * First department (create in UI or via this script): Clinical Medicine
 * This script ensures all 6 exist (skips any that already exist by name/code).
 *
 * Usage: node scripts/seedDepartments.js
 */
require("dotenv").config();
const {
  initializeModels,
  setupAssociations,
  Department,
  sequelize,
} = require("../src/models");

/** The one department to start with — create this first if seeding manually. */
const FIRST_DEPARTMENT = {
  name: "Clinical Medicine",
  code: "CLMED",
  description: "Clinical medicine training, diagnosis, and patient care programmes.",
  is_active: true,
};

/** Remaining departments to reach a total of 6. */
const OTHER_DEPARTMENTS = [
  {
    name: "Nursing",
    code: "NURS",
    description: "Nursing education, clinical practice, and patient care programmes.",
    is_active: true,
  },
  {
    name: "Medical Laboratory Sciences",
    code: "MEDLAB",
    description: "Medical laboratory technology, diagnostics, and pathology support.",
    is_active: true,
  },
  {
    name: "Pharmacy",
    code: "PHARM",
    description: "Pharmacy practice, dispensing, and pharmaceutical care programmes.",
    is_active: true,
  },
  {
    name: "Public Health",
    code: "PUBH",
    description: "Community health, epidemiology, and public health programmes.",
    is_active: true,
  },
  {
    name: "Nutrition and Dietetics",
    code: "NUTRI",
    description: "Human nutrition, dietetics, and food science programmes.",
    is_active: true,
  },
];

const ALL = [FIRST_DEPARTMENT, ...OTHER_DEPARTMENTS];

async function upsertDepartment(payload) {
  const byCode = payload.code
    ? await Department.findOne({ where: { code: payload.code } })
    : null;
  const byName = await Department.findOne({ where: { name: payload.name } });
  const existing = byCode || byName;

  if (existing) {
    await existing.update({
      name: payload.name,
      code: payload.code,
      description: payload.description,
      is_active: payload.is_active,
    });
    return { row: existing, created: false };
  }

  const row = await Department.create(payload);
  return { row, created: true };
}

async function main() {
  await initializeModels();
  setupAssociations();

  console.log("\n📌 First department (start here):");
  console.log(`   ${FIRST_DEPARTMENT.name} (${FIRST_DEPARTMENT.code})`);
  console.log("\n🌱 Seeding departments (target: 6)…\n");

  let created = 0;
  let updated = 0;

  for (const payload of ALL) {
    const result = await upsertDepartment(payload);
    if (result.created) {
      created += 1;
      console.log(`  ✓ created  ${result.row.name} [${result.row.code}]`);
    } else {
      updated += 1;
      console.log(`  · exists   ${result.row.name} [${result.row.code}]`);
    }
  }

  const total = await Department.count();
  console.log(`\nDone. Created ${created}, already present/updated ${updated}.`);
  console.log(`Departments in database: ${total}\n`);

  await sequelize.close();
}

main().catch(async (error) => {
  console.error("Failed to seed departments:", error.message);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
