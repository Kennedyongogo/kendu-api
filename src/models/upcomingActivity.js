const { DataTypes } = require("sequelize");

/** Floating hero “upcoming activity” ads — save publishes live (approved) */
module.exports = (sequelize) => {
  const UpcomingActivity = sequelize.define(
    "UpcomingActivity",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      body: {
        type: DataTypes.STRING(280),
        allowNull: true,
      },
      /** Visual style for the floating promo: event_card | ticket */
      shape: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "event_card",
      },
      accent: {
        type: DataTypes.ENUM("gold", "blue", "navy", "cream"),
        allowNull: false,
        defaultValue: "gold",
      },
      position_hint: {
        type: DataTypes.ENUM(
          "top_right",
          "mid_right",
          "bottom_right",
          "top_left",
          "mid_left"
        ),
        allowNull: false,
        defaultValue: "mid_right",
      },
      status: {
        type: DataTypes.ENUM("draft", "pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "draft",
      },
      display_start: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      display_end: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.STRING(400),
        allowNull: true,
      },
    },
    {
      tableName: "upcoming_activities",
      timestamps: true,
      underscored: true,
    }
  );

  return UpcomingActivity;
};
