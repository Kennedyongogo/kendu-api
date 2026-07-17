const { DataTypes } = require("sequelize");

/**
 * Timetable shell for one curriculum class — scoped by curriculum class level (term).
 * Legacy academic_year_id kept nullable for older rows.
 */
module.exports = (sequelize) => {
  const CurriculumClassTimetable = sequelize.define(
    "CurriculumClassTimetable",
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
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
        onDelete: "SET NULL",
      },
      academic_year_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "academic_years", key: "id" },
        onDelete: "SET NULL",
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "curriculum_class_timetables",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["curriculum_class_id"] },
        { fields: ["curriculum_class_level_id"] },
        { fields: ["academic_year_id"] },
      ],
    }
  );

  return CurriculumClassTimetable;
};
