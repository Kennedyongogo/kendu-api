/**
 * Seed sample units for programmes in a department.
 *
 * Usage:
 *   node scripts/seedStaffUnits.js --staff "staffone@gmail.com"
 *   node scripts/seedStaffUnits.js --user "ongogokennedy80@gmail.com" --department nursing --count 2
 *
 * Options:
 *   --user / --staff   Name or email fragment (default: staff 1)
 *   --department       Department name or code (uses user's department if omitted)
 *   --count            Units per programme (default: 4)
 *
 * Env: SEED_UNITS_STATUS, ACADEMIC_YEAR
 */
require("dotenv").config();
const { Op } = require("sequelize");
const {
  initializeModels,
  setupAssociations,
  User,
  Department,
  Programme,
  Unit,
  sequelize,
} = require("../src/models");

const ALL_TEMPLATES = [
  {
    suffix: "01",
    namePart: "Foundations",
    year_of_study: 1,
    semester: 1,
    credits: 3,
    hours: 45,
  },
  {
    suffix: "02",
    namePart: "Core Practice I",
    year_of_study: 1,
    semester: 2,
    credits: 3,
    hours: 45,
  },
  {
    suffix: "03",
    namePart: "Applied Studies",
    year_of_study: 2,
    semester: 1,
    credits: 4,
    hours: 60,
  },
  {
    suffix: "04",
    namePart: "Clinical Integration",
    year_of_study: 2,
    semester: 2,
    credits: 4,
    hours: 60,
  },
];

function currentAcademicYear() {
  if (process.env.ACADEMIC_YEAR) return String(process.env.ACADEMIC_YEAR).trim();
  const now = new Date();
  const y = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) return `${y}/${y + 1}`;
  return `${y - 1}/${y}`;
}

function programmeShortCode(programme, index) {
  const fromName = String(programme.name || "PRG")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
  return fromName || `P${index + 1}`;
}

function readArg(...flags) {
  const argv = process.argv.slice(2);
  for (const flag of flags) {
    const idx = argv.findIndex((a) => a === flag);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1].trim();
  }
  return "";
}

function readUserIdentifier() {
  return (
    readArg("--user", "-u", "--staff", "-s") ||
    process.env.STAFF_IDENTIFIER ||
    process.env.USER_IDENTIFIER ||
    "staff 1"
  ).trim();
}

function readUnitsPerProgramme() {
  const fromArg = readArg("--count", "-c");
  const n = parseInt(fromArg || process.env.SEED_UNITS_COUNT || "4", 10);
  return Math.min(ALL_TEMPLATES.length, Math.max(1, Number.isFinite(n) ? n : 4));
}

async function findUser(identifier) {
  const q = `%${identifier}%`;
  return User.findOne({
    where: {
      role: { [Op.in]: ["staff", "admin"] },
      [Op.or]: [
        { full_name: { [Op.iLike]: q } },
        { email: { [Op.iLike]: q } },
      ],
    },
    include: [
      {
        model: Department,
        as: "department",
        attributes: ["id", "name", "code"],
        required: false,
      },
    ],
  });
}

async function findDepartment(identifier, user) {
  if (!identifier) {
    if (!user?.department_id) return null;
    return (
      user.department ||
      Department.findByPk(user.department_id, {
        attributes: ["id", "name", "code"],
      })
    );
  }

  const q = `%${identifier}%`;
  return Department.findOne({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: q } },
        { code: { [Op.iLike]: q } },
      ],
    },
    attributes: ["id", "name", "code"],
  });
}

async function findProgrammesForDepartment(departmentId) {
  return Programme.findAll({
    where: { is_active: true },
    attributes: ["id", "name", "category", "duration_years"],
    include: [
      {
        model: Department,
        as: "departments",
        attributes: ["id", "name", "code"],
        where: { id: departmentId },
        through: { attributes: [] },
        required: true,
      },
    ],
    order: [["name", "ASC"]],
  });
}

async function upsertUnit(payload) {
  const existing = await Unit.findOne({
    where: {
      programme_id: payload.programme_id,
      code: payload.code,
      year_of_study: payload.year_of_study,
      semester: payload.semester,
      academic_year: payload.academic_year,
    },
  });

  if (existing) {
    await existing.update({
      name: payload.name,
      description: payload.description,
      credits: payload.credits,
      hours: payload.hours,
      department_id: payload.department_id,
      status: payload.status,
      created_by: payload.created_by,
      is_active: true,
    });
    return { row: existing, created: false };
  }

  const row = await Unit.create(payload);
  return { row, created: true };
}

async function main() {
  const userIdentifier = readUserIdentifier();
  const departmentIdentifier = readArg("--department", "-d");
  const unitsPerProgramme = readUnitsPerProgramme();
  const templates = ALL_TEMPLATES.slice(0, unitsPerProgramme);
  const academicYear = currentAcademicYear();
  const status = ["draft", "pending", "approved"].includes(process.env.SEED_UNITS_STATUS)
    ? process.env.SEED_UNITS_STATUS
    : "draft";

  await initializeModels();
  setupAssociations();

  const user = await findUser(userIdentifier);
  if (!user) {
    throw new Error(
      `No staff/admin user found matching "${userIdentifier}". Pass --user "email or name".`
    );
  }

  const department = await findDepartment(departmentIdentifier, user);
  if (!department) {
    throw new Error(
      departmentIdentifier
        ? `Department not found matching "${departmentIdentifier}".`
        : `User "${user.full_name}" has no department. Pass --department "nursing".`
    );
  }

  const programmes = await findProgrammesForDepartment(department.id);
  if (!programmes.length) {
    throw new Error(
      `No active programmes linked to department "${department.name}". Link programmes first.`
    );
  }

  console.log("\n🌱 Seeding units\n");
  console.log(`  User:       ${user.full_name} <${user.email}> (${user.role})`);
  console.log(`  Department: ${department.name}${department.code ? ` (${department.code})` : ""}`);
  console.log(`  Programmes: ${programmes.length}`);
  console.log(`  Per prog:   ${unitsPerProgramme} units`);
  console.log(`  Year:       ${academicYear}`);
  console.log(`  Status:     ${status}\n`);

  const deptCode = (department.code || "DEPT").toUpperCase().slice(0, 6);
  let created = 0;
  let updated = 0;

  for (let pIdx = 0; pIdx < programmes.length; pIdx += 1) {
    const programme = programmes[pIdx];
    const progCode = programmeShortCode(programme, pIdx);
    console.log(`📚 ${programme.name}`);

    for (const template of templates) {
      const code = `${deptCode}-${progCode}-${template.suffix}`;
      const name = `${template.namePart} — ${programme.name}`;
      const description = `${department.name} unit offering for ${programme.name} (Year ${template.year_of_study}, Semester ${template.semester}).`;

      const result = await upsertUnit({
        code,
        name,
        description,
        credits: template.credits,
        hours: template.hours,
        department_id: department.id,
        programme_id: programme.id,
        year_of_study: template.year_of_study,
        semester: template.semester,
        academic_year: academicYear,
        status,
        created_by: user.id,
        approved_by: status === "approved" ? user.id : null,
        approved_at: status === "approved" ? new Date() : null,
        rejection_reason: null,
        is_active: true,
      });

      if (result.created) {
        created += 1;
        console.log(`  ✓ created  ${code} — ${name}`);
      } else {
        updated += 1;
        console.log(`  · updated  ${code}`);
      }
    }
    console.log("");
  }

  const total = await Unit.count({
    where: { department_id: department.id, created_by: user.id },
  });

  console.log(`Done. Created ${created}, updated ${updated}.`);
  console.log(`Units by this user in ${department.name}: ${total}\n`);

  await sequelize.close();
}

main().catch(async (error) => {
  console.error("Failed to seed units:", error.message);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
