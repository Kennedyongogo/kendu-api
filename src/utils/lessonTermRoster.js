const { Op } = require("sequelize");

/**
 * Timetable scope for a student portal lesson list / live join.
 * - Same curriculum class required.
 * - If the student has a term, only that term's timetable.
 * - If the student has no term, only legacy timetables with no term set (not other terms).
 */
function timetableWhereForStudent(student) {
  if (!student?.curriculum_class_id) return null;
  const where = { curriculum_class_id: student.curriculum_class_id };
  if (student.curriculum_class_level_id) {
    where.curriculum_class_level_id = student.curriculum_class_level_id;
  } else {
    where.curriculum_class_level_id = { [Op.is]: null };
  }
  return where;
}

/**
 * Students eligible for notify/roster: same class + same term when timetable has a term.
 */
function studentWhereForLessonTimetable(timetable) {
  if (!timetable) return null;
  const ccId = timetable.curriculum_class_id || timetable.curriculum_class?.id;
  if (!ccId) return null;
  const where = { curriculum_class_id: ccId };
  const levelId = timetable.curriculum_class_level_id || timetable.curriculum_class_level?.id;
  if (levelId) {
    where.curriculum_class_level_id = levelId;
  }
  return where;
}

function studentMatchesLessonTimetable(student, timetable) {
  if (!student?.curriculum_class_id || !timetable) return false;
  const ccId = timetable.curriculum_class_id || timetable.curriculum_class?.id;
  if (!ccId || String(student.curriculum_class_id) !== String(ccId)) return false;

  const lessonTermId = timetable.curriculum_class_level_id || timetable.curriculum_class_level?.id || null;
  const studentTermId = student.curriculum_class_level_id || null;

  if (lessonTermId) {
    return studentTermId && String(studentTermId) === String(lessonTermId);
  }
  return !studentTermId;
}

function termLabelFromTimetable(timetable) {
  const name = timetable?.curriculum_class_level?.name;
  return name ? String(name).trim() : "";
}

module.exports = {
  timetableWhereForStudent,
  studentWhereForLessonTimetable,
  studentMatchesLessonTimetable,
  termLabelFromTimetable,
};
