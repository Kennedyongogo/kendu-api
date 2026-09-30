const { DataTypes } = require("sequelize");

/** One student's mark on a class register. */
module.exports = (sequelize) => {
  const AttendanceRecord = sequelize.define(
    "AttendanceRecord",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      session_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "absent",
        validate: { isIn: [["present", "absent"]] },
      },
      // Snapshots so the register reads the same after a student record changes.
      student_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      admission_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
    },
    {
      tableName: "attendance_records",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["session_id", "student_id"],
          name: "attendance_records_session_student_unique",
        },
        { fields: ["student_id"], name: "attendance_records_student_idx" },
      ],
    }
  );

  return AttendanceRecord;
};
