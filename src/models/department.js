const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Department = sequelize.define(
    "Department",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      /** FK → `teachers.id` (Head of department). */
      head_of_department: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "teachers", key: "id" },
      },
      budget: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      room_location: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "departments",
      timestamps: true,
      underscored: true,
    }
  );

  return Department;
};
