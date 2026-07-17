const { fn, col } = require("sequelize");
const {
  User,
  SchoolAdmin,
  Parent,
  Student,
  CurriculumClass,
  Curriculum,
  CurriculumSubject,
  CurriculumClassLevel,
} = require("../models");

/**
 * GET /api/elimu-plus/stats
 * Summary counts, bar charts (students / subjects per class), pie chart (students per curriculum).
 */
exports.getStats = async (req, res) => {
  try {
    const [
      usersCount,
      schoolAdminProfilesCount,
      parentProfilesCount,
      parentUserAccountsCount,
      studentProfilesCount,
    ] = await Promise.all([
      User.count(),
      SchoolAdmin.count(),
      Parent.count(),
      User.count({ where: { role: "parent" } }),
      Student.count(),
    ]);

    const [studentCountRows, curriculumCountRows] = await Promise.all([
      Student.findAll({
        attributes: ["curriculum_class_id", [fn("COUNT", col("id")), "student_count"]],
        group: ["curriculum_class_id"],
        raw: true,
      }),
      Student.findAll({
        attributes: ["curriculum_id", [fn("COUNT", col("id")), "student_count"]],
        group: ["curriculum_id"],
        raw: true,
      }),
    ]);

    const countByClassId = new Map();
    let unassignedStudentCount = 0;
    for (const row of studentCountRows) {
      const n = Number(row.student_count) || 0;
      if (row.curriculum_class_id) {
        countByClassId.set(String(row.curriculum_class_id), n);
      } else {
        unassignedStudentCount += n;
      }
    }

    const classes = await CurriculumClass.findAll({
      attributes: ["id", "name", "code"],
      include: [
        {
          model: Curriculum,
          as: "curriculum",
          attributes: ["id", "name", "type"],
          required: false,
        },
      ],
      order: [
        [{ model: Curriculum, as: "curriculum" }, "name", "ASC"],
        ["name", "ASC"],
      ],
    });

    const studentsByClass = classes.map((c) => {
      const plain = c.get({ plain: true });
      const curriculumLabel = plain.curriculum?.type || plain.curriculum?.name || "";
      const classLabel = plain.name || plain.code || "Class";
      return {
        class_id: plain.id,
        class_name: classLabel,
        class_code: plain.code || null,
        curriculum_id: plain.curriculum?.id || null,
        curriculum_name: plain.curriculum?.name || null,
        label: curriculumLabel ? `${classLabel} (${curriculumLabel})` : classLabel,
        student_count: countByClassId.get(String(plain.id)) || 0,
      };
    });

    if (unassignedStudentCount > 0) {
      studentsByClass.push({
        class_id: null,
        class_name: "Unassigned",
        class_code: null,
        curriculum_id: null,
        curriculum_name: null,
        label: "Unassigned",
        student_count: unassignedStudentCount,
      });
    }

    const countByCurriculumId = new Map();
    let unassignedCurriculumCount = 0;
    for (const row of curriculumCountRows) {
      const n = Number(row.student_count) || 0;
      if (row.curriculum_id) {
        countByCurriculumId.set(String(row.curriculum_id), n);
      } else {
        unassignedCurriculumCount += n;
      }
    }

    const curricula = await Curriculum.findAll({
      attributes: ["id", "name", "type"],
      order: [["name", "ASC"]],
    });

    const studentsByCurriculum = curricula.map((c) => {
      const plain = c.get({ plain: true });
      const label = plain.name || plain.type || "Curriculum";
      return {
        curriculum_id: plain.id,
        curriculum_name: plain.name,
        curriculum_type: plain.type || null,
        label,
        student_count: countByCurriculumId.get(String(plain.id)) || 0,
      };
    });

    if (unassignedCurriculumCount > 0) {
      studentsByCurriculum.push({
        curriculum_id: null,
        curriculum_name: null,
        curriculum_type: null,
        label: "Unassigned",
        student_count: unassignedCurriculumCount,
      });
    }

    const pieSeries = studentsByCurriculum.map((row, index) => ({
      name: row.label,
      value: row.student_count,
      curriculum_id: row.curriculum_id,
      color_index: index,
    }));

    const activeSubjects = await CurriculumSubject.findAll({
      attributes: ["id", "curriculum_id", "curriculum_class_id", "curriculum_class_level_id"],
      where: { is_active: true },
      include: [
        {
          model: CurriculumClass,
          as: "curriculum_class",
          attributes: ["id"],
          required: false,
        },
        {
          model: CurriculumClassLevel,
          as: "curriculum_class_level",
          attributes: ["curriculum_class_id"],
          required: false,
        },
      ],
    });

    const subjectCountByClassId = new Map();
    const curriculumWideByCurriculumId = new Map();
    for (const subject of activeSubjects) {
      const plain = subject.get({ plain: true });
      const classId =
        plain.curriculum_class_id ||
        plain.curriculum_class?.id ||
        plain.curriculum_class_level?.curriculum_class_id ||
        null;
      if (classId) {
        const key = String(classId);
        subjectCountByClassId.set(key, (subjectCountByClassId.get(key) || 0) + 1);
      } else if (plain.curriculum_id) {
        const key = String(plain.curriculum_id);
        curriculumWideByCurriculumId.set(
          key,
          (curriculumWideByCurriculumId.get(key) || 0) + 1
        );
      }
    }

    const subjectsByClass = classes.map((c) => {
      const plain = c.get({ plain: true });
      const curriculumLabel = plain.curriculum?.type || plain.curriculum?.name || "";
      const classLabel = plain.name || plain.code || "Class";
      return {
        class_id: plain.id,
        class_name: classLabel,
        class_code: plain.code || null,
        curriculum_id: plain.curriculum?.id || null,
        curriculum_name: plain.curriculum?.name || null,
        label: curriculumLabel ? `${classLabel} (${curriculumLabel})` : classLabel,
        subject_count: subjectCountByClassId.get(String(plain.id)) || 0,
      };
    });

    for (const curriculum of curricula) {
      const plain = curriculum.get({ plain: true });
      const wideCount = curriculumWideByCurriculumId.get(String(plain.id)) || 0;
      if (wideCount > 0) {
        subjectsByClass.push({
          class_id: null,
          class_name: "General",
          class_code: null,
          curriculum_id: plain.id,
          curriculum_name: plain.name || null,
          label: "General",
          subject_count: wideCount,
        });
      }
    }

    const subjectsBarSeries = subjectsByClass.map((row) => ({
      x: row.label,
      y: row.subject_count,
      class_id: row.class_id,
      curriculum_id: row.curriculum_id,
    }));

    const totalActiveSubjects = activeSubjects.length;

    return res.json({
      success: true,
      data: {
        counts: {
          users: usersCount,
          school_admin_profiles: schoolAdminProfilesCount,
          parent_profiles: parentProfilesCount,
          parent_user_accounts: parentUserAccountsCount,
          student_profiles: studentProfilesCount,
          active_subjects: totalActiveSubjects,
        },
        students_by_class: studentsByClass,
        bar_chart: {
          x_axis: "class",
          y_axis: "student_count",
          series: studentsByClass.map((row) => ({
            x: row.label,
            y: row.student_count,
            class_id: row.class_id,
            curriculum_id: row.curriculum_id,
          })),
        },
        subjects_by_class: subjectsByClass,
        subjects_bar_chart: {
          x_axis: "class",
          y_axis: "subject_count",
          series: subjectsBarSeries,
        },
        curricula: curricula.map((c) => {
          const plain = c.get({ plain: true });
          return {
            id: plain.id,
            name: plain.name,
            type: plain.type || null,
            label: plain.name || plain.type || "Curriculum",
          };
        }),
        students_by_curriculum: studentsByCurriculum,
        pie_chart: {
          dimension: "curriculum",
          value: "student_count",
          series: pieSeries,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

