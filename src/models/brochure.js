const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Brochure = sequelize.define(
    "Brochure",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      mime_type: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "brochures",
      timestamps: true,
      underscored: true,
    }
  );

  return Brochure;
};
