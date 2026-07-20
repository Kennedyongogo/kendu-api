const { DataTypes } = require("sequelize");

/**
 * Student registration against an approved unit offering.
 */
module.exports = (sequelize) => {
  const StudentUnitRegistration = sequelize.define(
    "StudentUnitRegistration",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      unit_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("registered", "dropped"),
        allowNull: false,
        defaultValue: "registered",
      },
      registered_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      dropped_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "student_unit_registrations",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["student_id", "unit_id"],
          name: "student_unit_registrations_student_unit_unique",
        },
        { fields: ["unit_id"] },
        { fields: ["status"] },
      ],
    }
  );

  return StudentUnitRegistration;
};
