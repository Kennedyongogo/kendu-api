const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProgrammeSubjectRequirement = sequelize.define(
    "ProgrammeSubjectRequirement",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      subject: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      minimum_grade: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      is_required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "programme_subject_requirements",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["programme_id", "subject"],
          name: "programme_subject_requirements_programme_subject_unique",
        },
      ],
    }
  );

  return ProgrammeSubjectRequirement;
};
