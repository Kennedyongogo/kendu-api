const { sequelize, Curriculum, CurriculumClass, CurriculumClassLevel, Student, User, Teacher } = require("../models");
const { recordAdminTransfer, listClassPlacementMovements, backfillStudentPlacementRegisters } = require("../utils/studentPlacementRegisterService");

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value, label) {
  const id = String(value || "").trim();
  if (!id || !uuidRe.test(id)) {
    const err = new Error(`${label} is invalid.`);
    err.status = 400;
    throw err;
  }
  return id;
}

function mapClassTransferStudent(row) {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    admission_number: plain.admission_number,
    gender: plain.gender,
    enrollment_date: plain.enrollment_date,
    full_name: plain.user?.full_name || null,
    username: plain.user?.username || null,
    email: plain.user?.email || null,
    profile_image: plain.user?.profile_image || null,
  };
}

/** Curricula for class-transfer tabs (updates when new curricula are added). */
exports.listClassTransferCurricula = async (req, res) => {
  try {
    const rows = await Curriculum.findAll({
      attributes: ["id", "name", "type", "description", "period"],
      order: [["name", "ASC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load curricula." });
  }
};

/** All classes in a curriculum with counts for the class-transfer carousel. */
exports.listClassTransferClasses = async (req, res) => {
  try {
    const curriculumId = String(req.params.curriculumId || "").trim();
    if (!curriculumId) {
      return res.status(400).json({ success: false, message: "curriculumId is required." });
    }

    const curriculum = await Curriculum.findByPk(curriculumId, {
      attributes: ["id", "name", "type", "description", "period"],
    });
    if (!curriculum) {
      return res.status(404).json({ success: false, message: "Curriculum not found." });
    }

    const classes = await CurriculumClass.findAll({
      where: { curriculum_id: curriculumId },
      attributes: [
        "id",
        "curriculum_id",
        "name",
        "code",
        "description",
        "period",
        "is_active",
        "created_at",
        "updated_at",
        [
          sequelize.literal(`(
            SELECT COUNT(*)::int
            FROM students s
            WHERE s.curriculum_class_id = "CurriculumClass".id
          )`),
          "student_count",
        ],
        [
          sequelize.literal(`(
            SELECT COUNT(*)::int
            FROM curriculum_class_levels l
            WHERE l.curriculum_class_id = "CurriculumClass".id
          )`),
          "level_count",
        ],
      ],
      order: [["name", "ASC"]],
    });

    const data = classes.map((row) => {
      const plain = row.get({ plain: true });
      return {
        id: plain.id,
        curriculum_id: plain.curriculum_id,
        name: plain.name,
        code: plain.code,
        description: plain.description,
        period: plain.period,
        is_active: plain.is_active,
        student_count: Number(plain.student_count) || 0,
        level_count: Number(plain.level_count) || 0,
        created_at: plain.created_at,
        updated_at: plain.updated_at,
      };
    });

    return res.json({
      success: true,
      data: {
        curriculum,
        classes: data,
        total: data.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load classes." });
  }
};

/** Terms / levels inside a class for class-transfer tabs. */
exports.listClassTransferLevels = async (req, res) => {
  try {
    const { Op } = require("sequelize");
    const classId = normalizeUuid(req.params.classId, "classId");
    const search = String(req.query.search || "").trim();
    const cls = await CurriculumClass.findByPk(classId, {
      attributes: ["id", "name", "code", "curriculum_id"],
    });
    if (!cls) {
      return res.status(404).json({ success: false, message: "Class not found." });
    }

    const levels = await CurriculumClassLevel.findAll({
      where: { curriculum_class_id: classId },
      attributes: [
        "id",
        "curriculum_class_id",
        "name",
        "level_order",
        "description",
        "start_date",
        "end_date",
        [
          sequelize.literal(`(
            SELECT COUNT(*)::int
            FROM students s
            WHERE s.curriculum_class_level_id = "CurriculumClassLevel".id
              AND s.curriculum_class_id = ${sequelize.escape(classId)}
          )`),
          "student_count",
        ],
      ],
      order: [
        ["level_order", "ASC"],
        ["name", "ASC"],
      ],
    });

    const data = levels.map((row) => {
      const plain = row.get({ plain: true });
      return {
        id: plain.id,
        curriculum_class_id: plain.curriculum_class_id,
        name: plain.name,
        level_order: plain.level_order,
        description: plain.description,
        start_date: plain.start_date,
        end_date: plain.end_date,
        student_count: Number(plain.student_count) || 0,
      };
    });

    const levelIds = data.map((level) => level.id);
    const studentsByLevel = Object.fromEntries(levelIds.map((id) => [id, []]));

    if (levelIds.length) {
      const baseStudentWhere = {
        curriculum_class_id: classId,
        curriculum_class_level_id: { [Op.in]: levelIds },
      };
      let studentWhere = baseStudentWhere;
      if (search) {
        const pattern = `%${search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        const ilike = { [Op.iLike]: pattern };
        studentWhere = {
          [Op.and]: [
            baseStudentWhere,
            {
              [Op.or]: [
                { admission_number: ilike },
                sequelize.where(sequelize.cast(sequelize.col("Student.gender"), "text"), ilike),
                { "$user.full_name$": ilike },
                { "$user.username$": ilike },
                { "$user.email$": ilike },
              ],
            },
          ],
        };
      }

      const studentRows = await Student.findAll({
        where: studentWhere,
        attributes: ["id", "admission_number", "gender", "enrollment_date", "curriculum_class_level_id"],
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "full_name", "username", "email", "profile_image"],
            required: false,
          },
        ],
        order: [["admission_number", "ASC"]],
        limit: 2000,
        subQuery: false,
      });

      for (const row of studentRows) {
        const plain = row.get({ plain: true });
        const levelId = plain.curriculum_class_level_id;
        if (!levelId || !studentsByLevel[levelId]) continue;
        studentsByLevel[levelId].push(mapClassTransferStudent(row));
      }
    }

    const levelsWithStudents = data.map((level) => ({
      ...level,
      students: studentsByLevel[level.id] || [],
    }));

    return res.json({
      success: true,
      data: {
        class: cls,
        levels: levelsWithStudents,
        total: levelsWithStudents.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load terms." });
  }
};

/** Students enrolled in a class term for class-transfer roster. */
exports.listClassTransferLevelStudents = async (req, res) => {
  try {
    const classId = normalizeUuid(req.params.classId, "classId");
    const levelId = normalizeUuid(req.params.levelId, "levelId");

    const level = await CurriculumClassLevel.findOne({
      where: { id: levelId, curriculum_class_id: classId },
      attributes: ["id", "name", "level_order", "curriculum_class_id"],
    });
    if (!level) {
      return res.status(404).json({ success: false, message: "Term not found in this class." });
    }

    const rows = await Student.findAll({
      where: {
        curriculum_class_id: classId,
        curriculum_class_level_id: levelId,
      },
      attributes: ["id", "admission_number", "gender", "enrollment_date", "curriculum_class_level_id"],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "username", "email", "profile_image"],
        },
      ],
      order: [
        ["admission_number", "ASC"],
      ],
      limit: 500,
    });

    const students = rows.map(mapClassTransferStudent);

    return res.json({
      success: true,
      data: {
        level,
        students,
        total: students.length,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load students." });
  }
};

async function resolveHomeroomTeacherId(curriculumClassId) {
  if (!curriculumClassId) return null;
  const row = await Teacher.findOne({
    where: {
      class_teacher_curriculum_class_id: curriculumClassId,
      is_class_teacher: true,
    },
    attributes: ["id"],
  });
  return row ? row.id : null;
}

async function loadMoveTargets(targetClassId, targetLevelId, transaction) {
  const targetClass = await CurriculumClass.findByPk(targetClassId, {
    attributes: ["id", "name", "code", "curriculum_id"],
    transaction,
  });
  if (!targetClass) {
    const err = new Error("Target class not found.");
    err.status = 404;
    throw err;
  }

  const targetLevel = await CurriculumClassLevel.findOne({
    where: { id: targetLevelId, curriculum_class_id: targetClassId },
    attributes: ["id", "name", "level_order", "curriculum_class_id"],
    transaction,
  });
  if (!targetLevel) {
    const err = new Error("Target term not found in that class.");
    err.status = 404;
    throw err;
  }

  return { targetClass, targetLevel };
}

async function moveStudentPlacement(studentId, targetClassId, targetLevelId, transaction, targets, actorUserId) {
  const { targetClass, targetLevel } =
    targets || (await loadMoveTargets(targetClassId, targetLevelId, transaction));

  const student = await Student.findByPk(studentId, {
    attributes: [
      "id",
      "admission_number",
      "gender",
      "enrollment_date",
      "curriculum_id",
      "curriculum_class_id",
      "curriculum_class_level_id",
      "class_teacher_id",
    ],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!student) {
    const err = new Error(`Student not found: ${studentId}`);
    err.status = 404;
    throw err;
  }

  const samePlacement =
    String(student.curriculum_class_id) === String(targetClassId) &&
    String(student.curriculum_class_level_id) === String(targetLevelId);
  if (samePlacement) {
    const unchanged = await Student.findByPk(studentId, {
      attributes: ["id", "admission_number", "gender", "enrollment_date", "curriculum_class_level_id"],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "username", "email", "profile_image"],
        },
      ],
      transaction,
    });
    return { student: mapClassTransferStudent(unchanged), unchanged: true };
  }

  const homeroomTeacherId = await resolveHomeroomTeacherId(targetClassId);

  await recordAdminTransfer(student, {
    curriculumId: targetClass.curriculum_id,
    curriculumClassId: targetClassId,
    curriculumClassLevelId: targetLevelId,
    actorUserId: actorUserId || null,
    transaction,
  });

  await student.update(
    {
      curriculum_id: targetClass.curriculum_id,
      curriculum_class_id: targetClassId,
      curriculum_class_level_id: targetLevelId,
      class_teacher_id: homeroomTeacherId,
    },
    { transaction }
  );

  const refreshed = await Student.findByPk(studentId, {
    attributes: ["id", "admission_number", "gender", "enrollment_date", "curriculum_class_level_id"],
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "full_name", "username", "email", "profile_image"],
      },
    ],
    transaction,
  });

  return { student: mapClassTransferStudent(refreshed), unchanged: false };
}

/** Move a student to another term and/or class (class transfer drag-and-drop). */
exports.moveClassTransferStudent = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const studentId = normalizeUuid(req.params.studentId, "studentId");
    const targetClassId = normalizeUuid(req.body?.curriculum_class_id, "curriculum_class_id");
    const targetLevelId = normalizeUuid(req.body?.curriculum_class_level_id, "curriculum_class_level_id");

    const targets = await loadMoveTargets(targetClassId, targetLevelId, t);
    const result = await moveStudentPlacement(studentId, targetClassId, targetLevelId, t, targets, req.user?.id);

    await t.commit();

    if (result.unchanged) {
      return res.json({
        success: true,
        message: "Student is already in that term.",
        data: { student: result.student, unchanged: true },
      });
    }

    const label = `${targets.targetLevel.name} · ${targets.targetClass.name}`;
    return res.json({
      success: true,
      message: `Moved to ${label}.`,
      data: {
        student: result.student,
        placement: {
          curriculum_id: targets.targetClass.curriculum_id,
          curriculum_class_id: targetClassId,
          curriculum_class_level_id: targetLevelId,
        },
        class: { id: targets.targetClass.id, name: targets.targetClass.name, code: targets.targetClass.code },
        level: {
          id: targets.targetLevel.id,
          name: targets.targetLevel.name,
          level_order: targets.targetLevel.level_order,
        },
      },
    });
  } catch (error) {
    await t.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not move student." });
  }
};

/** Move many students to the same term (class transfer bulk select). */
exports.moveClassTransferStudentsBulk = async (req, res) => {
  const rawIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
  const studentIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];

  if (!studentIds.length) {
    return res.status(400).json({ success: false, message: "student_ids is required." });
  }
  if (studentIds.length > 200) {
    return res.status(400).json({ success: false, message: "Too many students in one request (max 200)." });
  }

  const t = await sequelize.transaction();
  try {
    const targetClassId = normalizeUuid(req.body?.curriculum_class_id, "curriculum_class_id");
    const targetLevelId = normalizeUuid(req.body?.curriculum_class_level_id, "curriculum_class_level_id");
    const targets = await loadMoveTargets(targetClassId, targetLevelId, t);

    const results = [];
    for (const rawId of studentIds) {
      const studentId = normalizeUuid(rawId, "student_id");
      const result = await moveStudentPlacement(studentId, targetClassId, targetLevelId, t, targets, req.user?.id);
      results.push({ student_id: studentId, ...result });
    }

    await t.commit();

    const moved = results.filter((r) => !r.unchanged).length;
    const skipped = results.length - moved;
    const label = `${targets.targetLevel.name} · ${targets.targetClass.name}`;

    return res.json({
      success: true,
      message:
        moved === 0
          ? "All selected students are already in that term."
          : `Moved ${moved} student${moved === 1 ? "" : "s"} to ${label}.${skipped ? ` ${skipped} already in that term.` : ""}`,
      data: {
        moved,
        skipped,
        results,
        class: { id: targets.targetClass.id, name: targets.targetClass.name, code: targets.targetClass.code },
        level: {
          id: targets.targetLevel.id,
          name: targets.targetLevel.name,
          level_order: targets.targetLevel.level_order,
        },
      },
    });
  } catch (error) {
    await t.rollback();
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not move students." });
  }
};

/** Term register movements for a class (admin class transfer page). */
exports.listClassPlacementRegister = async (req, res) => {
  try {
    const classId = String(req.params.classId || "").trim();
    if (!classId) {
      return res.status(400).json({ success: false, message: "classId is required." });
    }

    const levelId = req.query.level_id != null ? String(req.query.level_id).trim() : "";
    const curriculumId = req.query.curriculum_id != null ? String(req.query.curriculum_id).trim() : "";
    const search = req.query.search != null ? String(req.query.search).trim() : "";
    const limit = req.query.limit;
    const offset = req.query.offset;

    const data = await listClassPlacementMovements({
      classId,
      levelId: levelId || undefined,
      curriculumId: curriculumId || undefined,
      search: search || undefined,
      limit,
      offset,
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load term register." });
  }
};

/** Create admission register rows for students who have placement but no history yet. */
exports.backfillPlacementRegister = async (req, res) => {
  try {
    const result = await backfillStudentPlacementRegisters({ actorUserId: req.user?.id });
    return res.json({
      success: true,
      message: `Backfill complete. Created ${result.created} admission record(s); skipped ${result.skipped} student(s) who already had history.`,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Backfill failed." });
  }
};
