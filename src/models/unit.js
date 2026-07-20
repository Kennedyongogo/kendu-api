const { DataTypes } = require("sequelize");

/**
 * Semester unit offering listed by department staff for a programme.
 * Students may register only after status becomes "approved".
 */
module.exports = (sequelize) => {
  const Unit = sequelize.define(
    "Unit",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      credits: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "Department that listed / owns this unit offering",
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Target year of study (1, 2, 3…)",
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "1 or 2",
      },
      academic_year: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'e.g. "2025/2026"',
      },
      status: {
        type: DataTypes.ENUM("draft", "pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "draft",
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "units",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["programme_id", "code", "year_of_study", "semester", "academic_year"],
          name: "units_programme_code_year_sem_acyear_unique",
        },
        { fields: ["department_id"] },
        { fields: ["status"] },
        { fields: ["created_by"] },
        { fields: ["academic_year", "semester"] },
      ],
    }
  );

  return Unit;
};
