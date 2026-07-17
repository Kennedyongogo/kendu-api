const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PortalReview = sequelize.define(
    "PortalReview",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: "users", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "students", key: "id" },
      },
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "parents", key: "id" },
      },
      reviewer_role: {
        type: DataTypes.ENUM("parent", "student"),
        allowNull: false,
      },
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      profile_image_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      reviewed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "portal_reviews",
      timestamps: true,
      underscored: true,
    }
  );

  return PortalReview;
};
