const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffBriefingAttachment = sequelize.define(
    "StaffBriefingAttachment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      briefing_id: {
        type: DataTypes.UUID,
        allowNull: false,
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
    },
    {
      tableName: "staff_briefing_attachments",
      timestamps: true,
      underscored: true,
    }
  );

  return StaffBriefingAttachment;
};
