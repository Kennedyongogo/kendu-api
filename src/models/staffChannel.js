const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffChannel = sequelize.define(
    "StaffChannel",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING(140),
        allowNull: false,
        unique: true,
      },
      /** null = school-wide lounge */
      department_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(300),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "staff_channels",
      timestamps: true,
      underscored: true,
    }
  );

  return StaffChannel;
};
