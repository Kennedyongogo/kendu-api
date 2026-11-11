const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const UserDepartment = sequelize.define(
    "UserDepartment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: "user_departments",
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ["user_id", "department_id"] },
        { fields: ["department_id"] },
        { fields: ["user_id"] },
      ],
    }
  );

  return UserDepartment;
};
