const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Music = sequelize.define(
    "Music",
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
      volume: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.35,
        validate: { min: 0, max: 1 },
      },
    },
    {
      tableName: "music_tracks",
      timestamps: true,
      underscored: true,
    }
  );

  return Music;
};
