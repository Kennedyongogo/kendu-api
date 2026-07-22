/**
 * Academic placement history for cohort / semester / year transfers.
 */
const { Op } = require("sequelize");
const {
  User,
  Programme,
  StudentAcademicHistory,
  sequelize,
} = require("../models");

const REASONS = Object.freeze({
  ADMISSION: "admission",
  ADMIN_TRANSFER: "admin_transfer",
  SEMESTER_TRANSFER: "semester_transfer",
  YEAR_TRANSFER: "year_transfer",
  PLACEMENT_UPDATE: "placement_update",
});

function dateOnlyToday() {
  return new Date().toISOString().slice(0, 10);
}

function placementLabel(programme, year, semester) {
  const parts = [];
  if (programme?.name) parts.push(programme.name);
  if (year != null) parts.push(`Year ${year}`);
  if (semester != null) parts.push(`Semester ${semester}`);
  return parts.join(" · ") || "—";
}

function mapHistoryEntry(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const prev = plain.previous_history;
  return {
    id: plain.id,
    student_id: plain.student_id,
    reason: plain.reason,
    status: plain.status,
    started_on: plain.started_on,
    completed_on: plain.completed_on,
    year_of_study: plain.year_of_study,
    semester: plain.semester,
    programme_id: plain.programme_id,
    programme: plain.programme || null,
    placement_label: placementLabel(plain.programme, plain.year_of_study, plain.semester),
    moved_by_user: plain.moved_by_user || null,
    student: plain.student
      ? {
          id: plain.student.id,
          full_name: plain.student.full_name,
          admission_number: plain.student.admission_number,
          email: plain.student.email,
          profile_image: plain.student.profile_image,
        }
      : null,
    previous_history: prev
      ? {
          id: prev.id,
          year_of_study: prev.year_of_study,
          semester: prev.semester,
          started_on: prev.started_on,
          completed_on: prev.completed_on,
          reason: prev.reason,
          placement_label: placementLabel(prev.programme, prev.year_of_study, prev.semester),
        }
      : null,
    is_active: plain.status === "active",
    created_at: plain.created_at,
  };
}

const historyIncludes = [
  {
    model: Programme,
    as: "programme",
    attributes: ["id", "name", "duration_years"],
    required: false,
  },
  {
    model: User,
    as: "moved_by_user",
    attributes: ["id", "full_name", "email"],
    required: false,
  },
  {
    model: User,
    as: "student",
    attributes: ["id", "full_name", "admission_number", "email", "profile_image"],
    required: false,
  },
  {
    model: StudentAcademicHistory,
    as: "previous_history",
    attributes: [
      "id",
      "programme_id",
      "year_of_study",
      "semester",
      "started_on",
      "completed_on",
      "reason",
    ],
    required: false,
    include: [
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  },
];

async function findActiveHistory(studentId, transaction) {
  return StudentAcademicHistory.findOne({
    where: { student_id: studentId, status: "active" },
    order: [["created_at", "DESC"]],
    transaction,
  });
}

async function closeActiveHistories(studentId, { completedOn, transaction } = {}) {
  const today = completedOn || dateOnlyToday();
  const active = await StudentAcademicHistory.findAll({
    where: { student_id: studentId, status: "active" },
    transaction,
  });
  let lastClosed = null;
  for (const row of active) {
    await row.update({ status: "completed", completed_on: today }, { transaction });
    lastClosed = row;
  }
  return lastClosed;
}

/**
 * Record an admin transfer and return the new active history row.
 * Call before updating the student's live year/semester fields.
 */
async function recordAdminTransfer(student, {
  programmeId,
  yearOfStudy,
  semester,
  actorUserId,
  reason,
  notes,
  transaction,
} = {}) {
  const today = dateOnlyToday();
  const targetProgrammeId = programmeId || student.programme_id;
  const targetYear = Number(yearOfStudy);
  const targetSem = Number(semester);

  const same =
    String(student.programme_id) === String(targetProgrammeId) &&
    Number(student.year_of_study) === targetYear &&
    Number(student.semester) === targetSem;

  if (same) return null;

  let previousId = null;
  const active = await findActiveHistory(student.id, transaction);

  if (active) {
    await active.update({ status: "completed", completed_on: today }, { transaction });
    previousId = active.id;
  } else if (student.programme_id && student.year_of_study && student.semester) {
    // Snapshot prior live placement so From is not blank on first transfer
    const snapshot = await StudentAcademicHistory.create(
      {
        student_id: student.id,
        programme_id: student.programme_id,
        year_of_study: student.year_of_study,
        semester: student.semester,
        started_on: today,
        completed_on: today,
        status: "completed",
        reason: REASONS.ADMISSION,
        moved_by_user_id: actorUserId || null,
      },
      { transaction }
    );
    previousId = snapshot.id;
  }

  let transferReason = reason || REASONS.ADMIN_TRANSFER;
  if (!reason) {
    if (
      String(student.programme_id) === String(targetProgrammeId) &&
      Number(student.year_of_study) === targetYear &&
      Number(student.semester) !== targetSem
    ) {
      transferReason = REASONS.SEMESTER_TRANSFER;
    } else if (
      String(student.programme_id) === String(targetProgrammeId) &&
      Number(student.year_of_study) !== targetYear
    ) {
      transferReason = REASONS.YEAR_TRANSFER;
    }
  }

  return StudentAcademicHistory.create(
    {
      student_id: student.id,
      programme_id: targetProgrammeId,
      year_of_study: targetYear,
      semester: targetSem,
      started_on: today,
      status: "active",
      reason: transferReason,
      moved_by_user_id: actorUserId || null,
      previous_history_id: previousId,
      notes: notes || null,
    },
    { transaction }
  );
}

async function listYearPlacementMovements({
  programmeId,
  yearOfStudy,
  semester,
  search,
  limit = 100,
  offset = 0,
} = {}) {
  const where = {
    programme_id: programmeId,
    year_of_study: Number(yearOfStudy),
  };
  if (semester != null && String(semester).trim() !== "") {
    where.semester = Number(semester);
  }

  const and = [where];
  if (search) {
    const pattern = `%${String(search).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const ilike = { [Op.iLike]: pattern };
    and.push({
      [Op.or]: [
        { "$student.full_name$": ilike },
        { "$student.admission_number$": ilike },
        { "$student.email$": ilike },
      ],
    });
  }

  const rows = await StudentAcademicHistory.findAll({
    where: { [Op.and]: and },
    include: historyIncludes,
    order: [["created_at", "DESC"]],
    limit: Math.min(200, Math.max(1, Number(limit) || 100)),
    offset: Math.max(0, Number(offset) || 0),
    subQuery: false,
  });

  return {
    entries: rows.map(mapHistoryEntry),
    total: rows.length,
  };
}

/**
 * Create admission history rows for students who have placement but no history yet.
 */
async function backfillAcademicHistories({ actorUserId } = {}) {
  const students = await User.findAll({
    where: {
      role: "student",
      programme_id: { [Op.ne]: null },
      year_of_study: { [Op.ne]: null },
      semester: { [Op.ne]: null },
    },
    attributes: ["id", "programme_id", "year_of_study", "semester"],
  });

  let created = 0;
  let skipped = 0;
  const today = dateOnlyToday();

  for (const student of students) {
    const existing = await StudentAcademicHistory.count({
      where: { student_id: student.id },
    });
    if (existing > 0) {
      skipped += 1;
      continue;
    }
    await StudentAcademicHistory.create({
      student_id: student.id,
      programme_id: student.programme_id,
      year_of_study: student.year_of_study,
      semester: student.semester,
      started_on: today,
      status: "active",
      reason: REASONS.ADMISSION,
      moved_by_user_id: actorUserId || null,
    });
    created += 1;
  }

  return { created, skipped };
}

module.exports = {
  REASONS,
  placementLabel,
  mapHistoryEntry,
  recordAdminTransfer,
  closeActiveHistories,
  listYearPlacementMovements,
  backfillAcademicHistories,
  dateOnlyToday,
  sequelize,
};
