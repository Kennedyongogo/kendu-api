require("dotenv").config();
const bcrypt = require("bcryptjs");
const { initializeModels, User, sequelize } = require("../src/models");

const ADMIN = {
  full_name: "Beth Ouma",
  email: "oumabeth@gmail.com",
  role: "admin",
  phone: "0798757460",
  is_public: false,
};

async function main() {
  await initializeModels();

  const email = ADMIN.email.trim().toLowerCase();
  const existing = await User.findOne({ where: { email } });

  if (existing) {
    console.log(`Admin user already exists (id: ${existing.id}, email: ${existing.email})`);
    await sequelize.close();
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD || "Kendu@2026";
  const password_hash = await bcrypt.hash(password, 10);

  const user = await User.create({
    ...ADMIN,
    email,
    password_hash,
  });

  console.log("Admin user created successfully.");
  console.log(`  id: ${user.id}`);
  console.log(`  name: ${user.full_name}`);
  console.log(`  email: ${user.email}`);
  console.log(`  role: ${user.role}`);
  console.log(`  phone: ${user.phone}`);
  console.log(`  temporary password: ${password}`);

  await sequelize.close();
}

main().catch(async (error) => {
  console.error("Failed to create admin user:", error.message);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
