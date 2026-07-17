const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SubjectGradingScale = sequelize.define(
    "SubjectGradingScale",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_subjects", key: "id" },
      },
      min_mark: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
      },
      max_mark: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
      },
      grade: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      points: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
      },
      is_pass: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "subject_grading_scales",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: [
            "curriculum_id",
            "curriculum_class_id",
            "curriculum_subject_id",
            "min_mark",
            "max_mark",
          ],
          name: "subject_grading_scales_unique_band",
        },
      ],
    }
  );

  return SubjectGradingScale;
};
