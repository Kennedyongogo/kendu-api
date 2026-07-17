const { DataTypes } = require("sequelize");

/** A class / grade band offered under a specific curriculum (e.g. Grade 3 CBC, Year 10 IGCSE, Form 2 8-4-4). */
module.exports = (sequelize) => {
  const CurriculumClass = sequelize.define(
    "CurriculumClass",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      /** How long this class band runs / spans (e.g. "1 academic year", "2 terms"). Optional per-class override vs curriculum.period. */
      period: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "curriculum_classes",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["curriculum_id", "code"], name: "curriculum_classes_curriculum_code_uniq" }],
    }
  );

  return CurriculumClass;
};
