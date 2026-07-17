const {
  Student,
  User,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  StudentTermRegistration,
  sequelize,
} = require("../models");

const REGISTRATION_REASONS = Object.freeze({
  ADMISSION: "admission",
  TERM_START: "term_start",
  ADMIN_TRANSFER: "admin_transfer",
  PLACEMENT_UPDATE: "placement_update",
});

const registrationListIncludes = [
  {
    model: Curriculum,
    as: "curriculum",
    attributes: ["id", "name", "type"],
    required: false,
  },
  {
    model: CurriculumClass,
    as: "curriculum_class",
    attributes: ["id", "name", "code"],
    required: false,
  },
  {
    model: CurriculumClassLevel,
    as: "curriculum_class_level",
    attributes: ["id", "name", "level_order", "start_date", "end_date"],
    required: false,
  },
  {
    model: User,
    as: "moved_by_user",
    attributes: ["id", "full_name", "username", "email"],
    required: false,
  },
  {
    model: StudentTermRegistration,
    as: "previous_registration",
    attributes: ["id", "curriculum_class_id", "curriculum_class_level_id", "started_on", "completed_on", "reason"],
    required: false,
    include: [
      {
        model: Curriculum,
        as: "curriculum",
        attributes: ["id", "name", "type"],
        required: false,
      },
      {
        model: CurriculumClass,
        as: "curriculum_class",
        attributes: ["id", "name", "code"],
        required: false,
      },
      {
        model: CurriculumClassLevel,
        as: "curriculum_class_level",
        attributes: ["id", "name", "level_order"],
        required: false,
      },
    ],
  },
];

function dateOnlyToday() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  if (value == null || value === "") return null;
  return String(value).slice(0, 10);
}

function placementKey(curriculumId, classId, levelId) {
  return `${curriculumId || ""}:${classId || ""}:${levelId || ""}`;
}

function studentPlacementKey(student) {
  return placementKey(student.curriculum_id, student.curriculum_class_id, student.curriculum_class_level_id);
}

function formatPlacementLabel(curriculum, curriculumClass, level) {
  const parts = [];
  if (curriculum?.name) parts.push(curriculum.name);
  if (curriculumClass?.name) {
    parts.push(curriculumClass.code ? `${curriculumClass.name} (${curriculumClass.code})` : curriculumClass.name);
  }
  if (level?.name) parts.push(level.name);
  return parts.join(" · ") || "—";
}

function mapRegistrationEntry(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const prev = plain.previous_registration;
  return {
    id: plain.id,
    student_id: plain.student_id,
    reason: plain.reason,
    status: plain.status,
    started_on: plain.started_on,
    completed_on: plain.completed_on,
    term_start_date: plain.term_start_date,
    term_end_date: plain.term_end_date,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    curriculum_id: plain.curriculum_id,
    curriculum_class_id: plain.curriculum_class_id,
    curriculum_class_level_id: plain.curriculum_class_level_id,
    curriculum: plain.curriculum || null,
    curriculum_class: plain.curriculum_class || null,
    curriculum_class_level: plain.curriculum_class_level || null,
    placement_label: formatPlacementLabel(plain.curriculum, plain.curriculum_class, plain.curriculum_class_level),
    moved_by_user: plain.moved_by_user || null,
    previous_registration: prev
      ? {
          id: prev.id,
          reason: prev.reason,
          started_on: prev.started_on,
          completed_on: prev.completed_on,
          curriculum_class: prev.curriculum_class || null,
          curriculum_class_level: prev.curriculum_class_level || null,
          placement_label: formatPlacementLabel(prev.curriculum, prev.curriculum_class, prev.curriculum_class_level),
        }
      : null,
    is_active: plain.status === "active",
  };
}

async function findActiveRegistration(studentId, transaction) {
  return StudentTermRegistration.findOne({
    where: { student_id: studentId, status: "active" },
    order: [["created_at", "DESC"]],
    transaction,
  });
}

async function closeActiveRegistrations(studentId, { completedOn, transaction }) {
  const today = completedOn || dateOnlyToday();
  const active = await StudentTermRegistration.findAll({
    where: { student_id: studentId, status: "active" },
    transaction,
  });
  if (!active.length) return null;

  let lastClosed = null;
  for (const row of active) {
    await row.update({ status: "completed", completed_on: today }, { transaction });
    lastClosed = row;
  }
  return lastClosed;
}

async function openPlacementRecord(
  {
    studentId,
    curriculumId,
    curriculumClassId,
    curriculumClassLevelId,
    startedOn,
    reason,
    movedByUserId,
    previousRegistrationId,
    termStartDate,
    termEndDate,
    status = "active",
    completedOn = null,
  },
  transaction
) {
  const today = dateOnlyToday();
  return StudentTermRegistration.create(
    {
      student_id: studentId,
      curriculum_id: curriculumId,
      curriculum_class_id: curriculumClassId,
      curriculum_class_level_id: curriculumClassLevelId,
      started_on: startedOn || today,
      term_start_date: termStartDate ?? null,
      term_end_date: termEndDate ?? null,
      status,
      completed_on: completedOn || (status === "completed" ? today : null),
      reason: reason || REGISTRATION_REASONS.TERM_START,
      moved_by_user_id: movedByUserId || null,
      previous_registration_id: previousRegistrationId || null,
    },
    { transaction }
  );
}

/** When moving a student with no register history, record where they came from. */
async function snapshotPriorPlacement(student, { completedOn, transaction } = {}) {
  if (!hasFullPlacement(student)) return null;

  const today = completedOn || dateOnlyToday();
  const startedOn = normalizeDateOnly(student.enrollment_date) || today;

  return openPlacementRecord(
    {
      studentId: student.id,
      curriculumId: student.curriculum_id,
      curriculumClassId: student.curriculum_class_id,
      curriculumClassLevelId: student.curriculum_class_level_id,
      startedOn,
      reason: REGISTRATION_REASONS.ADMISSION,
      movedByUserId: null,
      termStartDate: startedOn,
      termEndDate: null,
      status: "completed",
      completedOn: today,
    },
    transaction
  );
}

function hasFullPlacement(student) {
  return Boolean(student?.curriculum_id && student?.curriculum_class_id && student?.curriculum_class_level_id);
}

/** Record initial admission placement when a student is enrolled. */
async function recordAdmissionPlacement(student, { actorUserId, transaction } = {}) {
  if (!hasFullPlacement(student)) return null;

  const existing = await findActiveRegistration(student.id, transaction);
  if (existing) return existing;

  const startedOn = normalizeDateOnly(student.enrollment_date) || dateOnlyToday();
  return openPlacementRecord(
    {
      studentId: student.id,
      curriculumId: student.curriculum_id,
      curriculumClassId: student.curriculum_class_id,
      curriculumClassLevelId: student.curriculum_class_level_id,
      startedOn,
      reason: REGISTRATION_REASONS.ADMISSION,
      movedByUserId: actorUserId,
      termStartDate: startedOn,
      termEndDate: null,
    },
    transaction
  );
}

/** Close current placement and open a new row (admin transfer or placement edit). */
async function recordPlacementChange(
  student,
  {
    curriculumId,
    curriculumClassId,
    curriculumClassLevelId,
    reason,
    actorUserId,
    transaction,
  }
) {
  if (!curriculumId || !curriculumClassId || !curriculumClassLevelId) return null;

  const today = dateOnlyToday();
  const same =
    placementKey(student.curriculum_id, student.curriculum_class_id, student.curriculum_class_level_id) ===
    placementKey(curriculumId, curriculumClassId, curriculumClassLevelId);
  if (same) return findActiveRegistration(student.id, transaction);

  const previous = await closeActiveRegistrations(student.id, { completedOn: today, transaction });
  let previousRegistrationId = previous?.id || null;

  if (!previousRegistrationId && hasFullPlacement(student)) {
    const snapshot = await snapshotPriorPlacement(student, { completedOn: today, transaction });
    previousRegistrationId = snapshot?.id || null;
  }

  return openPlacementRecord(
    {
      studentId: student.id,
      curriculumId,
      curriculumClassId,
      curriculumClassLevelId,
      startedOn: today,
      reason: reason || REGISTRATION_REASONS.PLACEMENT_UPDATE,
      movedByUserId: actorUserId,
      previousRegistrationId,
      termStartDate: today,
      termEndDate: null,
    },
    transaction
  );
}

/** Student portal: mark term as officially started (may upgrade admission row). */
async function recordTermStart(student, { actorUserId, transaction } = {}) {
  if (!hasFullPlacement(student)) return null;

  const today = dateOnlyToday();
  const active = await findActiveRegistration(student.id, transaction);
  const key = studentPlacementKey(student);

  if (active && placementKey(active.curriculum_id, active.curriculum_class_id, active.curriculum_class_level_id) === key) {
    if (active.reason === REGISTRATION_REASONS.TERM_START) return active;
    await active.update(
      {
        reason: REGISTRATION_REASONS.TERM_START,
        started_on: today,
        term_start_date: today,
      },
      { transaction }
    );
    return active.reload({ transaction });
  }

  const previous = await closeActiveRegistrations(student.id, { completedOn: today, transaction });
  return openPlacementRecord(
    {
      studentId: student.id,
      curriculumId: student.curriculum_id,
      curriculumClassId: student.curriculum_class_id,
      curriculumClassLevelId: student.curriculum_class_level_id,
      startedOn: today,
      reason: REGISTRATION_REASONS.TERM_START,
      movedByUserId: actorUserId,
      previousRegistrationId: previous?.id || null,
      termStartDate: today,
      termEndDate: null,
    },
    transaction
  );
}

/** Class transfer drag-and-drop / bulk move. */
async function recordAdminTransfer(
  student,
  { curriculumId, curriculumClassId, curriculumClassLevelId, actorUserId, transaction }
) {
  return recordPlacementChange(student, {
    curriculumId,
    curriculumClassId,
    curriculumClassLevelId,
    reason: REGISTRATION_REASONS.ADMIN_TRANSFER,
    actorUserId,
    transaction,
  });
}

async function listStudentPlacementHistory(studentId, { limit = 50 } = {}) {
  const rows = await StudentTermRegistration.findAll({
    where: { student_id: studentId },
    include: registrationListIncludes,
    order: [
      ["started_on", "DESC"],
      ["created_at", "DESC"],
    ],
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
  });
  return rows.map(mapRegistrationEntry);
}

function escapeLikePattern(term) {
  return String(term || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function ilikeTextColumn(columnRef, ilike) {
  return sequelize.where(sequelize.cast(sequelize.col(columnRef), "text"), ilike);
}

function buildPlacementRegisterSearchWhere(search) {
  const { Op } = require("sequelize");
  const term = String(search || "").trim();
  if (!term) return null;

  const pattern = `%${escapeLikePattern(term)}%`;
  const ilike = { [Op.iLike]: pattern };
  const or = [
    { reason: ilike },
    ilikeTextColumn("StudentTermRegistration.status", ilike),
    ilikeTextColumn("StudentTermRegistration.started_on", ilike),
    ilikeTextColumn("StudentTermRegistration.completed_on", ilike),
    { "$student.admission_number$": ilike },
    ilikeTextColumn("student.gender", ilike),
    { "$student.user.full_name$": ilike },
    { "$student.user.username$": ilike },
    { "$student.user.email$": ilike },
    { "$curriculum.name$": ilike },
    { "$curriculum.type$": ilike },
    { "$curriculum_class.name$": ilike },
    { "$curriculum_class.code$": ilike },
    { "$curriculum_class_level.name$": ilike },
    { "$moved_by_user.full_name$": ilike },
    { "$moved_by_user.username$": ilike },
    { "$moved_by_user.email$": ilike },
    { "$previous_registration.curriculum.name$": ilike },
    { "$previous_registration.curriculum_class.name$": ilike },
    { "$previous_registration.curriculum_class.code$": ilike },
    { "$previous_registration.curriculum_class_level.name$": ilike },
  ];

  const lower = term.toLowerCase();
  if (lower.includes("active") || lower.includes("current")) {
    or.push({ status: "active" });
  }
  if (lower.includes("complete")) {
    or.push({ status: "completed" });
  }
  if (lower.includes("admit")) {
    or.push({ reason: REGISTRATION_REASONS.ADMISSION });
  }
  if (lower.includes("start")) {
    or.push({ reason: REGISTRATION_REASONS.TERM_START });
  }
  if (lower.includes("transfer") || lower.includes("moved")) {
    or.push({ reason: REGISTRATION_REASONS.ADMIN_TRANSFER });
  }

  return { [Op.or]: or };
}

async function listClassPlacementMovements({
  classId,
  levelId,
  curriculumId,
  search,
  limit = 100,
  offset = 0,
} = {}) {
  const { Op } = require("sequelize");
  const where = {};
  if (classId) where.curriculum_class_id = classId;
  if (levelId) where.curriculum_class_level_id = levelId;
  if (curriculumId) where.curriculum_id = curriculumId;

  const searchWhere = buildPlacementRegisterSearchWhere(search);
  const finalWhere = searchWhere ? { [Op.and]: [where, searchWhere] } : where;

  const { rows, count } = await StudentTermRegistration.findAndCountAll({
    where: finalWhere,
    include: [
      ...registrationListIncludes,
      {
        model: Student,
        as: "student",
        attributes: ["id", "admission_number", "gender", "enrollment_date"],
        required: true,
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "full_name", "username", "email", "profile_image"],
            required: false,
          },
        ],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: Math.min(Math.max(Number(limit) || 100, 1), 200),
    offset: Math.max(Number(offset) || 0, 0),
    subQuery: false,
    distinct: true,
  });

  return {
    total: count,
    entries: rows.map((row) => {
      const entry = mapRegistrationEntry(row);
      const plain = row.get({ plain: true });
      const stud = plain.student;
      return {
        ...entry,
        student: stud
          ? {
              id: stud.id,
              admission_number: stud.admission_number,
              gender: stud.gender,
              full_name: stud.user?.full_name || null,
              username: stud.user?.username || null,
              profile_image: stud.user?.profile_image || null,
            }
          : null,
      };
    }),
  };
}

/** One-time / on-demand: admission rows for students with placement but no register history. */
async function backfillStudentPlacementRegisters({ actorUserId } = {}) {
  const { Op } = require("sequelize");
  const students = await Student.findAll({
    where: {
      curriculum_id: { [Op.ne]: null },
      curriculum_class_id: { [Op.ne]: null },
      curriculum_class_level_id: { [Op.ne]: null },
    },
    attributes: ["id", "curriculum_id", "curriculum_class_id", "curriculum_class_level_id", "enrollment_date"],
    order: [["created_at", "ASC"]],
  });

  let created = 0;
  let skipped = 0;

  for (const student of students) {
    const count = await StudentTermRegistration.count({ where: { student_id: student.id } });
    if (count > 0) {
      skipped += 1;
      continue;
    }
    await recordAdmissionPlacement(student, { actorUserId: actorUserId || null });
    created += 1;
  }

  return { created, skipped, total: students.length };
}

module.exports = {
  REGISTRATION_REASONS,
  dateOnlyToday,
  mapRegistrationEntry,
  recordAdmissionPlacement,
  recordPlacementChange,
  recordTermStart,
  recordAdminTransfer,
  listStudentPlacementHistory,
  listClassPlacementMovements,
  backfillStudentPlacementRegisters,
  formatPlacementLabel,
};
