const { ExamTemplate, ExamQuestion, User, Curriculum, CurriculumClass, CurriculumClassLevel, Teacher } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };

const examDetailIncludes = [
  { model: ExamTemplate, as: "template", required: false },
  {
    model: ExamQuestion,
    as: "questions",
    separate: true,
    order: [["order_number", "ASC"]],
  },
  { model: User, as: "creator", required: false, ...userSafe },
  { model: Curriculum, as: "curriculum", required: false, attributes: ["id", "name", "type"] },
  {
    model: CurriculumClass,
    as: "curriculum_class",
    required: false,
    attributes: ["id", "name", "code", "curriculum_id"],
  },
  {
    model: CurriculumClassLevel,
    as: "curriculum_class_level",
    required: false,
    attributes: ["id", "name", "level_order"],
  },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

const examListIncludes = [
  { model: ExamTemplate, as: "template", required: false, attributes: ["id", "name"] },
  { model: Curriculum, as: "curriculum", required: false, attributes: ["id", "name", "type"] },
  {
    model: CurriculumClass,
    as: "curriculum_class",
    required: false,
    attributes: ["id", "name", "code"],
  },
  {
    model: Teacher,
    as: "teacher",
    required: false,
    include: [{ model: User, as: "user", attributes: ["id", "full_name", "username", "email"] }],
  },
];

module.exports = { examDetailIncludes, examListIncludes, userSafe };
