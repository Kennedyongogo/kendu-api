const { DataTypes } = require("sequelize");

/** Maps to table `admins` — Sequelize model name SchoolAdmin to avoid confusion with application “admin” role. */
module.exports = (sequelize) => {
  const SchoolAdmin = sequelize.define(
    "SchoolAdmin",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      admin_type: {
        type: DataTypes.ENUM(
          "super_admin",
          "principal",
          "vice_principal",
          "accountant",
          "librarian",
          "admin_staff"
        ),
        allowNull: false,
      },
      profile_picture: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "admins",
      timestamps: true,
      underscored: true,
    }
  );

  return SchoolAdmin;
};
