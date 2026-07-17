const {
  Student,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  StudentTermRegistration,
} = require("../models");
const { recordTermStart, REGISTRATION_REASONS } = require("./studentPlacementRegisterService");

function dateOnlyToday() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateOnly(value) {
  if (value == null || value === "") return null;
  return String(value).slice(0, 10);
}

function isAfterDate(a, b) {
  if (!a || !b) return false;
  return normalizeDateOnly(a) > normalizeDateOnly(b);
}

async function loadStudentWithPlacement(userId) {
  return Student.findOne({
    where: { user_id: userId },
    attributes: [
      "id",
      "admission_number",
      "curriculum_id",
      "curriculum_class_id",
      "curriculum_class_level_id",
    ],
    include: [
      { model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: false },
      {
        model: CurriculumClass,
        as: "curriculum_class",
        attributes: ["id", "name", "code"],
        required: false,
      },
      {
        model: CurriculumClassLevel,
        as: "curriculum_class_level",
        attributes: ["id", "name", "level_order", "start_date", "end_date", "curriculum_class_id"],
        required: false,
      },
    ],
  });
}

async function findActiveRegistration(studentId) {
  return StudentTermRegistration.findOne({
    where: { student_id: studentId, status: "active" },
    order: [["created_at", "DESC"]],
  });
}

/** Only auto-complete when the registration itself has an explicit end date that has passed. */
async function completeRegistrationIfEnded(registration, today = dateOnlyToday()) {
  if (!registration || registration.status !== "active") return registration;
  const end = normalizeDateOnly(registration.term_end_date);
  if (end && isAfterDate(today, end)) {
    await registration.update({
      status: "completed",
      completed_on: today,
    });
    return registration.reload();
  }
  return registration;
}

function placementMatchesRegistration(student, registration) {
  if (!student || !registration) return false;
  return (
    String(student.curriculum_id) === String(registration.curriculum_id) &&
    String(student.curriculum_class_id) === String(registration.curriculum_class_id) &&
    String(student.curriculum_class_level_id) === String(registration.curriculum_class_level_id)
  );
}

function registrationTermEnded(registration, today = dateOnlyToday()) {
  if (!registration) return false;
  if (registration.status === "completed") return true;
  const end = normalizeDateOnly(registration.term_end_date);
  return Boolean(end && isAfterDate(today, end));
}

function buildTermStatusPayload(student, registration, today = dateOnlyToday()) {
  const level = student?.curriculum_class_level || null;
  const classScheduleStart = normalizeDateOnly(level?.start_date);
  const classScheduleEnd = normalizeDateOnly(level?.end_date);
  const studentStartedOn = normalizeDateOnly(registration?.started_on);
  const studentTermStart = normalizeDateOnly(registration?.term_start_date ?? studentStartedOn);
  const studentTermEnd = normalizeDateOnly(registration?.term_end_date);
  const termEnded = registrationTermEnded(registration, today);
  const placementOk = placementMatchesRegistration(student, registration);
  const termStarted =
    registration?.reason === REGISTRATION_REASONS.TERM_START;
  const portalUnlocked =
    Boolean(registration) &&
    registration.status === "active" &&
    placementOk &&
    termStarted &&
    !termEnded;

  let canStartTerm = false;
  let blockReason = null;

  if (!student?.curriculum_id || !student?.curriculum_class_id || !student?.curriculum_class_level_id) {
    blockReason = "Your class and term are not set yet. Ask the school to complete your enrollment.";
  } else if (!level) {
    blockReason = "Your assigned term could not be found. Contact the school office.";
  } else if (portalUnlocked) {
    blockReason = null;
  } else if (registration && registration.status === "active" && termEnded && placementOk) {
    blockReason = "Your current term registration has ended. Contact the school to move you to the next term.";
  } else if (registration && registration.status === "active" && !placementOk) {
    blockReason = "Your class or term was updated. Start the new term from your profile.";
    canStartTerm = true;
  } else if (registration && registration.status === "active" && placementOk && !termStarted) {
    canStartTerm = true;
    blockReason = `Start ${level.name} to unlock classes, exams, assignments, and report cards. You can begin anytime — admission dates vary.`;
  } else {
    canStartTerm = true;
    blockReason = `Start ${level.name} to unlock classes, exams, assignments, and report cards. You can begin anytime — admission dates vary.`;
  }

  return {
    portal_unlocked: portalUnlocked,
    can_start_term: canStartTerm,
    message: blockReason,
    today,
    term: level
      ? {
          id: level.id,
          name: level.name,
          level_order: level.level_order,
          /** Student's personal term window (after they click Start). */
          start_date: studentTermStart,
          end_date: studentTermEnd,
          started_on: studentStartedOn,
          term_ended: termEnded,
        }
      : null,
    /** Class-wide planned schedule — informational only; does not gate portal access. */
    class_schedule: level
      ? {
          start_date: classScheduleStart,
          end_date: classScheduleEnd,
        }
      : null,
    placement: {
      curriculum_id: student?.curriculum_id || null,
      curriculum_class_id: student?.curriculum_class_id || null,
      curriculum_class_level_id: student?.curriculum_class_level_id || null,
      curriculum: student?.curriculum || null,
      curriculum_class: student?.curriculum_class || null,
      curriculum_class_level: level,
    },
    active_registration: registration
      ? {
          id: registration.id,
          started_on: registration.started_on,
          term_start_date: registration.term_start_date,
          term_end_date: registration.term_end_date,
          status: registration.status,
          completed_on: registration.completed_on,
          reason: registration.reason,
          placement_matches: placementOk,
        }
      : null,
  };
}

async function getStudentTermStatusForUser(userId) {
  const student = await loadStudentWithPlacement(userId);
  if (!student) {
    const err = new Error("Student profile not found.");
    err.status = 404;
    throw err;
  }

  let registration = await findActiveRegistration(student.id);
  if (registration) {
    registration = await completeRegistrationIfEnded(registration);
    if (registration.status !== "active") {
      registration = null;
    }
  }

  return buildTermStatusPayload(student, registration);
}

async function startStudentTermForUser(userId) {
  const student = await loadStudentWithPlacement(userId);
  if (!student) {
    const err = new Error("Student profile not found.");
    err.status = 404;
    throw err;
  }

  const today = dateOnlyToday();
  const level = student.curriculum_class_level;
  if (!student.curriculum_id || !student.curriculum_class_id || !student.curriculum_class_level_id) {
    const err = new Error("Your class and term must be set before you can start a term.");
    err.status = 400;
    throw err;
  }
  if (!level || String(level.curriculum_class_id) !== String(student.curriculum_class_id)) {
    const err = new Error("Your assigned term does not belong to your current class.");
    err.status = 400;
    throw err;
  }

  let registration = await findActiveRegistration(student.id);
  if (registration) {
    registration = await completeRegistrationIfEnded(registration);
  }

  if (
    registration &&
    registration.status === "active" &&
    placementMatchesRegistration(student, registration) &&
    registration.reason === REGISTRATION_REASONS.TERM_START
  ) {
    return {
      created: false,
      status: buildTermStatusPayload(student, registration, today),
    };
  }

  const hadActive = Boolean(registration && registration.status === "active");
  registration = await recordTermStart(student, { actorUserId: userId });

  return {
    created: !hadActive || registration?.reason === REGISTRATION_REASONS.TERM_START,
    status: buildTermStatusPayload(student, registration, today),
  };
}

async function assertStudentPortalUnlocked(userId) {
  const status = await getStudentTermStatusForUser(userId);
  if (!status.portal_unlocked) {
    const err = new Error(status.message || "Start your term from your profile to access this area.");
    err.status = 403;
    err.code = "TERM_NOT_STARTED";
    err.data = status;
    throw err;
  }
  return status;
}

module.exports = {
  dateOnlyToday,
  getStudentTermStatusForUser,
  startStudentTermForUser,
  assertStudentPortalUnlocked,
};
