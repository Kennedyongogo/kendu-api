const { DataTypes } = require("sequelize");

/** Many-to-many: a teacher may belong to several departments (not the same as HOD). */
module.exports = (sequelize) => {
  const TeacherDepartment = sequelize.define(
    "TeacherDepartment",
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
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "departments", key: "id" },
        onDelete: "CASCADE",
      },
    },
    {
      tableName: "teacher_departments",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["teacher_id", "department_id"] }],
    }
  );

  return TeacherDepartment;
};
