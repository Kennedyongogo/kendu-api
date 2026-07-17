const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "EventLiveReaction",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      event_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "events", key: "id" },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      emoji: { type: DataTypes.STRING(16), allowNull: false },
    },
    {
      tableName: "event_live_reactions",
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  );
};
