const { DataTypes } = require("sequelize");

/** Billing/calendar term (distinct from grading `Semester` model). */
module.exports = (sequelize) => {
  const AcademicTerm = sequelize.define(
    "AcademicTerm",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      academic_year_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "academic_years", key: "id" },
      },
      term_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      term_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "academic_terms",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["academic_year_id", "term_number"] }],
    }
  );

  return AcademicTerm;
};
