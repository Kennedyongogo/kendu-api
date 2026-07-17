const { DataTypes } = require("sequelize");

/** Topic for a curriculum subject. Subtopics are rows on `CurriculumSubjectSubtopic`. */
module.exports = (sequelize) => {
  const CurriculumSubjectTopic = sequelize.define(
    "CurriculumSubjectTopic",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_subjects", key: "id" },
        onDelete: "CASCADE",
      },
      /** JS/API use `name`; DB may still use legacy column `title` until renamed via migration. */
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "title",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "curriculum_subject_topics",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["curriculum_subject_id"], name: "curriculum_subject_topics_subject_idx" }],
    }
  );

  return CurriculumSubjectTopic;
};
