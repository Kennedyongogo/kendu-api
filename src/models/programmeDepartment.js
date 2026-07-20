const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProgrammeDepartment = sequelize.define(
    "ProgrammeDepartment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: "programme_departments",
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ["programme_id", "department_id"] },
        { fields: ["department_id"] },
      ],
    }
  );

  return ProgrammeDepartment;
};
