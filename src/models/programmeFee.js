const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProgrammeFee = sequelize.define(
    "ProgrammeFee",
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
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 10 },
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 2 },
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "KES",
      },
      label: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: "Optional label e.g. Tuition, Examination",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "programme_fees",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["programme_id", "year_of_study", "semester"],
          name: "programme_fees_programme_year_semester_unique",
        },
      ],
    }
  );

  return ProgrammeFee;
};
