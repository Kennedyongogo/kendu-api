const { DataTypes } = require("sequelize");

/**
 * Split / phases inside one curriculum class (e.g. Term 1, Term 2, Term 3).
 * Distinct from school-wide AcademicTerm / Semester (those tie to academic_year).
 */
module.exports = (sequelize) => {
  const CurriculumClassLevel = sequelize.define(
    "CurriculumClassLevel",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      level_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
    },
    {
      tableName: "curriculum_class_levels",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["curriculum_class_id", "name"], name: "curriculum_class_levels_class_name_uniq" }],
    }
  );

  return CurriculumClassLevel;
};
