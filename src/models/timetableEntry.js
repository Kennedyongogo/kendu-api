const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TimetableEntry = sequelize.define(
    "TimetableEntry",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM("class", "cat", "exam"),
        allowNull: false,
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "timetable_entries",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["programme_id", "year_of_study", "semester"] },
        { fields: ["category"] },
        { fields: ["starts_at"] },
        { fields: ["ends_at"] },
      ],
    }
  );

  return TimetableEntry;
};
