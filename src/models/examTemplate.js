const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "ExamTemplate",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(160), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      school_profile_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "school_profiles", key: "id" },
      },
      layout_json: { type: DataTypes.JSON, allowNull: false, defaultValue: { elements: [] } },
      paper_size: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "A4" },
      orientation: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "portrait" },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "exam_templates",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["school_profile_id"] }, { fields: ["is_active"] }],
    }
  );
};
