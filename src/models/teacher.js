const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Teacher = sequelize.define(
    "Teacher",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      employee_number: {
        type: DataTypes.STRING(20),
        unique: true,
        allowNull: false,
      },
      qualification: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      specialization: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      years_of_experience: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      joining_date: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW,
      },
      salary: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      bank_account_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      highest_degree: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      is_class_teacher: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      class_teacher_curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "SET NULL",
      },
      profile_picture: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "teachers",
      timestamps: true,
      underscored: true,
    }
  );

  return Teacher;
};
