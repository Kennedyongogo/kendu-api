const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM("admin", "staff", "student"),
        allowNull: false,
      },
      full_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      position: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      admission_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Programme the student is enrolled in",
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Department for staff/admin users",
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Student year of study (e.g. 1, 2, 3)",
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Current semester (1 or 2)",
      },
      gender: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [["male", "female"]],
        },
      },
      boarding_status: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [["boarder", "non_boarder"]],
        },
      },
      profile_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_public: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      timestamps: true,
      underscored: true,
    }
  );

  return User;
};
