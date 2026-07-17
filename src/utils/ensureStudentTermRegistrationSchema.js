const { sequelize } = require("../config/database");

async function ensureStudentTermRegistrationSchema() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS student_term_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      curriculum_id UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
      curriculum_class_id UUID NOT NULL REFERENCES curriculum_classes(id) ON DELETE CASCADE,
      curriculum_class_level_id UUID NOT NULL REFERENCES curriculum_class_levels(id) ON DELETE CASCADE,
      started_on DATE NOT NULL,
      term_start_date DATE,
      term_end_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      completed_on DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT student_term_registrations_status_chk
        CHECK (status IN ('active', 'completed', 'cancelled'))
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS student_term_registrations_student_id_idx
      ON student_term_registrations(student_id)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS student_term_registrations_level_id_idx
      ON student_term_registrations(curriculum_class_level_id)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS student_term_registrations_student_status_idx
      ON student_term_registrations(student_id, status)
  `);

  await sequelize.query(`
    ALTER TABLE student_term_registrations
      ADD COLUMN IF NOT EXISTS reason VARCHAR(30) NOT NULL DEFAULT 'term_start'
  `);
  await sequelize.query(`
    ALTER TABLE student_term_registrations
      ADD COLUMN IF NOT EXISTS moved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
  `);
  await sequelize.query(`
    ALTER TABLE student_term_registrations
      ADD COLUMN IF NOT EXISTS previous_registration_id UUID REFERENCES student_term_registrations(id) ON DELETE SET NULL
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS student_term_registrations_class_id_idx
      ON student_term_registrations(curriculum_class_id)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS student_term_registrations_created_at_idx
      ON student_term_registrations(created_at DESC)
  `);
}

module.exports = { ensureStudentTermRegistrationSchema };
