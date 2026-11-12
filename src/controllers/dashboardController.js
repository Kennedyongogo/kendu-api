const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Programme,
  AdmissionApplication,
  Department,
  Unit,
  StudentUnitRegistration,
  Assignment,
  ExamPeriod,
  ExamSlot,
  LibraryLoan,
  LibraryBook,
  FeePayment,
  Announcement,
  Brochure,
  TimetableEntry,
  ChurchBooking,
  ChurchService,
  MealServing,
  MealCard,
  AccessPolicy,
  UserDepartment,
  ProgrammeDepartment,
} = require("../models");
const { OFFICE_ROLES, getActorDepartmentIds, DEPARTMENT_SCOPED_ROLES } = require("../middleware/auth");
const { cached, cacheKey } = require("../services/cacheService");

const ADMISSION_STATUSES = ["pending", "under_review", "accepted", "rejected"];

function groupCountMap(rows, keyField = "status") {
  const map = {};
  for (const row of rows || []) {
    const key = row[keyField] ?? "unknown";
    map[key] = Number(row.count) || 0;
  }
  return map;
}

function programmeSeries(rows) {
  return (rows || []).map((row) => {
    const plain = row.get ? row.get({ plain: true }) : row;
    return {
      programme_id: plain.programme_id || plain.programme?.id || null,
      name: plain.programme?.name || "Unknown programme",
      count: Number(plain.count) || 0,
    };
  });
}

async function countBy(model, where = {}, groupField) {
  if (!groupField) return model.count({ where });
  const rows = await model.findAll({
    attributes: [groupField, [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    where,
    group: [groupField],
    raw: true,
  });
  return groupCountMap(rows, groupField);
}

async function studentsByProgramme(whereExtra = {}) {
  const rows = await User.findAll({
    attributes: ["programme_id", [sequelize.fn("COUNT", sequelize.col("User.id")), "count"]],
    where: { role: "student", ...whereExtra },
    include: [
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name"],
        required: true,
      },
    ],
    group: ["User.programme_id", "programme.id", "programme.name"],
    order: [[sequelize.literal("count"), "DESC"]],
  });
  return programmeSeries(rows);
}

async function admissionsByProgramme(whereExtra = {}) {
  const rows = await AdmissionApplication.findAll({
    attributes: [
      "programme_id",
      [sequelize.fn("COUNT", sequelize.col("AdmissionApplication.id")), "count"],
    ],
    where: whereExtra,
    include: [
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name"],
        required: true,
      },
    ],
    group: ["AdmissionApplication.programme_id", "programme.id", "programme.name"],
    order: [[sequelize.literal("count"), "DESC"]],
  });
  return programmeSeries(rows);
}

async function safeCount(fn, fallback = 0) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function buildDashboardStats(req) {
    const role = req.user?.role || "admin";
    const programmeFilter = String(req.query.programme_id || "").trim() || null;
    const academicYear = String(req.query.academic_year || "").trim() || null;
    const departmentIds = getActorDepartmentIds(req.user);
    const isDeptScoped = DEPARTMENT_SCOPED_ROLES.includes(role);

    const studentWhere = { role: "student" };
    if (programmeFilter) studentWhere.programme_id = programmeFilter;

    const admissionWhere = {};
    if (programmeFilter) admissionWhere.programme_id = programmeFilter;

    const unitWhere = {};
    if (programmeFilter) unitWhere.programme_id = programmeFilter;
    if (academicYear) unitWhere.academic_year = academicYear;
    if (isDeptScoped && departmentIds.length) {
      unitWhere.department_id = { [Op.in]: departmentIds };
    }

    const assignmentWhere = {};
    if (programmeFilter) assignmentWhere.programme_id = programmeFilter;
    if (academicYear) assignmentWhere.academic_year = academicYear;
    if (isDeptScoped && departmentIds.length) {
      assignmentWhere.department_id = { [Op.in]: departmentIds };
    }

    // Programme IDs visible to HOD/lecturer via linked departments
    let scopedProgrammeIds = null;
    if (isDeptScoped && departmentIds.length) {
      const links = await ProgrammeDepartment.findAll({
        where: { department_id: { [Op.in]: departmentIds } },
        attributes: ["programme_id"],
        raw: true,
      }).catch(() => []);
      scopedProgrammeIds = [...new Set(links.map((l) => l.programme_id))];
      if (scopedProgrammeIds.length) {
        studentWhere.programme_id = programmeFilter
          ? programmeFilter
          : { [Op.in]: scopedProgrammeIds };
        if (!programmeFilter) {
          admissionWhere.programme_id = { [Op.in]: scopedProgrammeIds };
        }
      } else {
        studentWhere.programme_id = "00000000-0000-0000-0000-000000000000";
        admissionWhere.programme_id = "00000000-0000-0000-0000-000000000000";
      }
    }

    const now = new Date();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const examWhere = programmeFilter ? { programme_id: programmeFilter } : {};
    const timetableWhere = programmeFilter ? { programme_id: programmeFilter } : {};

    const [
      totalUsers,
      adminCount,
      officeCount,
      studentCount,
      programmeCount,
      departmentCount,
      unitCount,
      admissionTotal,
      admissionStatusMap,
      admissionsProgramme,
      studentsProgramme,
      genderMap,
      boardingMap,
      registrationStatusMap,
      registrationTotal,
      assignmentTotal,
      assignmentPublished,
      examStatusMap,
      examTotal,
      libraryBooks,
      libraryLoansMap,
      feePayments,
      announcements,
      timetableEntries,
      churchBookings,
      mealServingsToday,
      officeRoleRows,
      activeStudents,
      pendingUnits,
      approvedUnits,
      draftUnits,
      admissionsPending,
      admissionsAccepted,
      registrationsActive,
      announcementsPublished,
      brochures,
      libraryLoansActive,
      libraryLoansOverdue,
      feePaymentsConfirmed,
      feeAmountConfirmed,
      studentsBoarders,
      studentsNonBoarders,
      mealCards,
      examSlots,
      churchServices,
      churchServicesUpcoming,
      accessPolicies,
      accessPoliciesEnabled,
    ] = await Promise.all([
      safeCount(() => User.count()),
      safeCount(() => User.count({ where: { role: "admin" } })),
      safeCount(() => User.count({ where: { role: { [Op.in]: OFFICE_ROLES } } })),
      safeCount(() => User.count({ where: studentWhere })),
      safeCount(() => Programme.count({ where: { is_active: true } })),
      safeCount(() => Department.count({ where: { is_active: true } })),
      safeCount(() => Unit.count({ where: unitWhere })),
      safeCount(() => AdmissionApplication.count({ where: admissionWhere })),
      safeCount(() => countBy(AdmissionApplication, admissionWhere, "status"), {}),
      safeCount(() => admissionsByProgramme(admissionWhere), []),
      safeCount(() => studentsByProgramme(studentWhere.programme_id ? { programme_id: studentWhere.programme_id } : {}), []),
      safeCount(() => countBy(User, studentWhere, "gender"), {}),
      safeCount(() => countBy(User, studentWhere, "boarding_status"), {}),
      safeCount(async () => {
        const unitIds = isDeptScoped && departmentIds.length
          ? (await Unit.findAll({ where: unitWhere, attributes: ["id"], raw: true })).map((u) => u.id)
          : null;
        const where = unitIds
          ? { unit_id: { [Op.in]: unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"] } }
          : {};
        return countBy(StudentUnitRegistration, where, "status");
      }, {}),
      safeCount(async () => {
        const unitIds = isDeptScoped && departmentIds.length
          ? (await Unit.findAll({ where: unitWhere, attributes: ["id"], raw: true })).map((u) => u.id)
          : null;
        const where = unitIds
          ? { unit_id: { [Op.in]: unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"] } }
          : {};
        return StudentUnitRegistration.count({ where });
      }),
      safeCount(() => Assignment.count({ where: assignmentWhere })),
      safeCount(() => Assignment.count({ where: { ...assignmentWhere, is_published: true } })),
      safeCount(() => countBy(ExamPeriod, examWhere, "status"), {}),
      safeCount(() => ExamPeriod.count({ where: examWhere })),
      safeCount(() => LibraryBook.count()),
      safeCount(() => countBy(LibraryLoan, {}, "status"), {}),
      safeCount(() => FeePayment.count()),
      safeCount(() => Announcement.count()),
      safeCount(() => TimetableEntry.count({ where: timetableWhere })),
      safeCount(() => ChurchBooking.count({ where: { status: "active" } })),
      safeCount(() =>
        MealServing.count({
          where: { served_at: { [Op.between]: [dayStart, dayEnd] } },
        })
      ),
      safeCount(async () => {
        const rows = await User.findAll({
          attributes: ["role", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
          where: { role: { [Op.in]: OFFICE_ROLES } },
          group: ["role"],
          raw: true,
        });
        return rows.map((r) => ({
          role: r.role,
          label: String(r.role || "").replace(/_/g, " "),
          count: Number(r.count) || 0,
        }));
      }, []),
      safeCount(() => User.count({ where: { ...studentWhere, is_active: true } })),
      safeCount(() => Unit.count({ where: { ...unitWhere, status: "pending" } })),
      safeCount(() => Unit.count({ where: { ...unitWhere, status: "approved" } })),
      safeCount(() => Unit.count({ where: { ...unitWhere, status: "draft" } })),
      safeCount(() =>
        AdmissionApplication.count({
          where: { ...admissionWhere, status: { [Op.in]: ["pending", "under_review"] } },
        })
      ),
      safeCount(() => AdmissionApplication.count({ where: { ...admissionWhere, status: "accepted" } })),
      safeCount(async () => {
        const unitIds = isDeptScoped && departmentIds.length
          ? (await Unit.findAll({ where: unitWhere, attributes: ["id"], raw: true })).map((u) => u.id)
          : null;
        const where = {
          status: "registered",
          ...(unitIds
            ? { unit_id: { [Op.in]: unitIds.length ? unitIds : ["00000000-0000-0000-0000-000000000000"] } }
            : {}),
        };
        return StudentUnitRegistration.count({ where });
      }),
      safeCount(() => Announcement.count({ where: { is_published: true } })),
      safeCount(() => Brochure.count()),
      safeCount(() => LibraryLoan.count({ where: { status: "active" } })),
      safeCount(() => LibraryLoan.count({ where: { status: "overdue" } })),
      safeCount(() => FeePayment.count({ where: { status: "confirmed" } })),
      safeCount(async () => {
        const sum = await FeePayment.sum("amount", { where: { status: "confirmed" } });
        return Number(sum || 0);
      }),
      safeCount(() => User.count({ where: { ...studentWhere, boarding_status: "boarder" } })),
      safeCount(() => User.count({ where: { ...studentWhere, boarding_status: "non_boarder" } })),
      safeCount(() => MealCard.count()),
      safeCount(() => ExamSlot.count()),
      safeCount(() => ChurchService.count()),
      safeCount(() =>
        ChurchService.count({
          where: {
            status: "approved",
            starts_at: { [Op.gte]: now },
          },
        })
      ),
      safeCount(() => AccessPolicy.count()),
      safeCount(() => AccessPolicy.count({ where: { is_enabled: true } })),
    ]);

    const byStatus = Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0]));
    for (const [key, value] of Object.entries(admissionStatusMap || {})) {
      if (Object.prototype.hasOwnProperty.call(byStatus, key)) byStatus[key] = value;
    }

    const programmes = await Programme.findAll({
      where: { is_active: true },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    let myDepartments = [];
    if (isDeptScoped && departmentIds.length) {
      myDepartments = await Department.findAll({
        where: { id: { [Op.in]: departmentIds } },
        attributes: ["id", "name", "code"],
        order: [["name", "ASC"]],
      });
    }

    const staffInDepartments = isDeptScoped && departmentIds.length
      ? await safeCount(() =>
          UserDepartment.count({
            where: { department_id: { [Op.in]: departmentIds } },
          })
        )
      : 0;

    const payload = {
      role,
      generated_at: new Date().toISOString(),
      filters: {
        programme_id: programmeFilter,
        academic_year: academicYear || null,
        department_ids: isDeptScoped ? departmentIds : [],
      },
      filter_options: {
        programmes: programmes.map((p) => ({ id: p.id, name: p.name })),
        departments: myDepartments.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
        })),
      },
      school: {
        total_users: totalUsers,
        admins: adminCount,
        offices: officeCount,
        students: studentCount,
        students_active: activeStudents,
        students_boarders: studentsBoarders,
        students_non_boarders: studentsNonBoarders,
        programmes: programmeCount,
        departments: departmentCount,
        units: unitCount,
        units_pending: pendingUnits,
        units_approved: approvedUnits,
        units_draft: draftUnits,
        admissions_total: admissionTotal,
        admissions_pending: admissionsPending,
        admissions_accepted: admissionsAccepted,
        registrations: registrationTotal,
        registrations_active: registrationsActive,
        assignments: assignmentTotal,
        assignments_published: assignmentPublished,
        exam_periods: examTotal,
        exam_slots: examSlots,
        library_books: libraryBooks,
        library_loans_active: libraryLoansActive,
        library_loans_overdue: libraryLoansOverdue,
        fee_payments: feePayments,
        fee_payments_confirmed: feePaymentsConfirmed,
        fee_amount_confirmed: feeAmountConfirmed,
        announcements,
        announcements_published: announcementsPublished,
        brochures,
        timetable_entries: timetableEntries,
        church_bookings_active: churchBookings,
        church_services: churchServices,
        church_services_upcoming: churchServicesUpcoming,
        meals_served_today: mealServingsToday,
        meal_cards: mealCards,
        access_policies: accessPolicies,
        access_policies_enabled: accessPoliciesEnabled,
        staff_in_departments: staffInDepartments,
      },
      charts: {
        admissions_by_status: byStatus,
        admissions_by_programme: admissionsProgramme,
        students_by_programme: studentsProgramme,
        students_by_gender: {
          male: Number(genderMap.male || 0),
          female: Number(genderMap.female || 0),
          unspecified: Number(genderMap.null || genderMap.undefined || 0),
        },
        students_by_boarding: {
          boarder: Number(boardingMap.boarder || 0),
          non_boarder: Number(boardingMap.non_boarder || 0),
          unspecified: Number(
            (boardingMap.null || 0) + (boardingMap.undefined || 0)
          ),
        },
        registrations_by_status: registrationStatusMap || {},
        exam_periods_by_status: examStatusMap || {},
        library_loans_by_status: libraryLoansMap || {},
        office_roles: officeRoleRows || [],
      },
      // Keep legacy shape for existing admin UI compatibility
      total_users: totalUsers,
      roles: {
        admin: adminCount,
        offices: officeCount,
        student: studentCount,
      },
      programmes: programmeCount,
      admissions: {
        total: admissionTotal,
        by_status: byStatus,
        by_programme: admissionsProgramme,
      },
      students: {
        total: studentCount,
        by_programme: studentsProgramme,
      },
    };

    return payload;
}

exports.buildDashboardStats = buildDashboardStats;

exports.getDashboardStats = async (req, res) => {
  try {
    const role = req.user?.role || "admin";
    const programmeId = String(req.query.programme_id || "").trim() || "all";
    const academicYear = String(req.query.academic_year || "").trim() || "all";
    const deptKey = (getActorDepartmentIds(req.user) || []).slice().sort().join(",") || "none";
    const key = cacheKey("dashboard", role, req.user?.id || "anon", programmeId, academicYear, deptKey);
    const payload = await cached(key, () => buildDashboardStats(req), Number(process.env.REDIS_DASHBOARD_TTL || 45));
    return res.json({ success: true, data: payload });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportDashboardReport = async (req, res) => {
  try {
    const { buildDashboardPdf } = require("../services/dashboardPdfService");
    const payload = await buildDashboardStats(req);
    const section = String(req.query.section || "full").trim() || "full";
    const title = String(req.query.title || "").trim() || null;
    const pdfBuffer = await buildDashboardPdf(payload, {
      section,
      title,
      actorName: req.user?.full_name || req.user?.email || "",
    });
    const role = payload.role || "dashboard";
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `kendu-${role}-${section}-${stamp}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
