const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Curriculum = sequelize.define(
    "Curriculum",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      /** Free-text pathway label (e.g. "CBC", "IGCSE", "844") — set by the school. */
      type: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      /** How long this pathway runs until completion (e.g. "6 years", "4 academic years"). */
      period: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
    },
    {
      tableName: "curricula",
      timestamps: true,
      underscored: true,
    }
  );

  return Curriculum;
};
