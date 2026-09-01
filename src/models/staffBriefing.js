const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffBriefing = sequelize.define(
    "StaffBriefing",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      excerpt: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      /** null = school-wide; otherwise scoped to one department */
      department_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      requires_acknowledgement: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      published_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "staff_briefings",
      timestamps: true,
      underscored: true,
    }
  );

  return StaffBriefing;
};
