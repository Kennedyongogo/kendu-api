const { DataTypes } = require("sequelize");

/** Many-to-many: curricula a teacher is involved in teaching. */
module.exports = (sequelize) => {
  const TeacherCurriculumJoin = sequelize.define(
    "TeacherCurriculumJoin",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      teacher_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "teachers", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
        onDelete: "CASCADE",
      },
    },
    {
      tableName: "teacher_curricula",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["teacher_id", "curriculum_id"] }],
    }
  );

  return TeacherCurriculumJoin;
};
