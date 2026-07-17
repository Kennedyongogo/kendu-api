const bcrypt = require("bcryptjs");
const {
  sequelize,
  User,
  Teacher,
  Department,
  Student,
  Curriculum,
  CurriculumClass,
  CurriculumSubject,
  TeacherDepartment,
  TeacherCurriculumJoin,
  TeacherCurriculumSubject,
  TeacherTeachingCurriculumClass,
} = require("../models");
const { normalizeEmail, normalizeUsername, duplicateUserWhere } = require("../utils/userIdentity");
const { parsePagination } = require("../utils/pagination");
const { convertToRelativePath } = require("../utils/filePath");
const { unlinkProfilePictureIfExists } = require("../utils/profilePictureStorage");

const userExclude = { exclude: ["password_hash"] };

const homeroomCurriculumInclude = {
  model: CurriculumClass,
  as: "homeroom_curriculum_class",
  required: false,
  attributes: ["id", "name", "code"],
  include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: false }],
};

const teachingCurriculumClassesInclude = {
  model: CurriculumClass,
  as: "teaching_curriculum_classes",
  through: { attributes: [] },
  required: false,
  attributes: ["id", "name", "code"],
  include: [{ model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: false }],
};

const teacherProfileIncludes = [
  { model: User, as: "user", attributes: userExclude },
  { model: Department, as: "departments", through: { attributes: [] } },
  { model: Curriculum, as: "teaching_curricula", through: { attributes: [] } },
  { model: CurriculumSubject, as: "teaching_curriculum_subjects", through: { attributes: [] } },
  teachingCurriculumClassesInclude,
  homeroomCurriculumInclude,
];

function parseMaybeJsonArray(val) {
  if (val === undefined || val === null || val === "") return undefined;
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeTeacherRequestBody(req) {
  const b = { ...req.body };
  ["department_ids", "curriculum_ids", "curriculum_subject_ids", "curriculum_class_ids"].forEach((key) => {
    if (b[key] !== undefined) {
      const arr = parseMaybeJsonArray(b[key]);
      if (arr !== undefined) b[key] = arr;
    }
  });
  if (b.years_of_experience !== undefined && b.years_of_experience !== "") {
    const n = parseInt(String(b.years_of_experience), 10);
    if (!Number.isNaN(n)) b.years_of_experience = n;
  }
  if (b.salary !== undefined && b.salary !== "") {
    const f = Number.parseFloat(String(b.salary));
    if (!Number.isNaN(f)) b.salary = f;
  }
  return b;
}

function resolveTeacherProfilePicture(req, existingTeacher) {
  if (req.file?.path) {
    const rel = convertToRelativePath(req.file.path);
    if (existingTeacher?.profile_picture && existingTeacher.profile_picture !== rel) {
      unlinkProfilePictureIfExists(existingTeacher.profile_picture);
    }
    return rel;
  }
  if (req.body.profile_picture !== undefined) {
    const v = req.body.profile_picture;
    if (v === "" || v === null) {
      if (existingTeacher?.profile_picture) unlinkProfilePictureIfExists(existingTeacher.profile_picture);
      return null;
    }
    const s = String(v).trim();
    return s || null;
  }
  return undefined;
}

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return !!v;
}

async function assertCurriculumClassExists(id, transaction) {
  const row = await CurriculumClass.findByPk(id, { attributes: ["id"], transaction });
  if (!row) {
    const err = new Error("homeroom curriculum class not found");
    err.statusCode = 400;
    throw err;
  }
}

/** Defaults is_class_teacher false when omitted unless class_teacher_curriculum_class_id is set (then true). */
async function resolveHomeroomForCreate(body, transaction) {
  const rawId = body.class_teacher_curriculum_class_id;
  const cid = rawId != null && String(rawId).trim() !== "" ? String(rawId).trim() : null;
  const hasIs = Object.prototype.hasOwnProperty.call(body, "is_class_teacher");
  const isCt = hasIs ? coerceBool(body.is_class_teacher) : !!cid;
  if (!isCt) return { is_class_teacher: false, class_teacher_curriculum_class_id: null };
  if (!cid) {
    const err = new Error("class_teacher_curriculum_class_id is required when is_class_teacher is true");
    err.statusCode = 400;
    throw err;
  }
  await assertCurriculumClassExists(cid, transaction);
  return { is_class_teacher: true, class_teacher_curriculum_class_id: cid };
}

/** Partial homeroom update; returns fields to merge or null if unchanged. */
async function resolveHomeroomForUpdate(body, teacher, transaction) {
  const hasIs = Object.prototype.hasOwnProperty.call(body, "is_class_teacher");
  const hasId = Object.prototype.hasOwnProperty.call(body, "class_teacher_curriculum_class_id");
  if (!hasIs && !hasId) return null;

  let cid = hasId
    ? body.class_teacher_curriculum_class_id === null || body.class_teacher_curriculum_class_id === ""
      ? null
      : String(body.class_teacher_curriculum_class_id).trim()
    : teacher.class_teacher_curriculum_class_id;

  let isCt;
  if (hasIs) {
    isCt = coerceBool(body.is_class_teacher);
  } else if (hasId && cid) {
    isCt = true;
  } else if (hasId && !cid) {
    isCt = false;
  } else {
    isCt = !!teacher.is_class_teacher;
  }

  if (!isCt) return { is_class_teacher: false, class_teacher_curriculum_class_id: null };

  if (!cid) {
    const err = new Error("class_teacher_curriculum_class_id is required when is_class_teacher is true");
    err.statusCode = 400;
    throw err;
  }
  await assertCurriculumClassExists(cid, transaction);
  return { is_class_teacher: true, class_teacher_curriculum_class_id: cid };
}

function normalizeUuidArray(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const v of value) {
    if (v == null || v === "") continue;
    const s = String(v).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function assertAllIdsExist(Model, ids, label) {
  if (!ids.length) return;
  const rows = await Model.findAll({ where: { id: ids }, attributes: ["id"] });
  if (rows.length !== ids.length) {
    const err = new Error(`One or more ${label} IDs are invalid`);
    err.statusCode = 400;
    throw err;
  }
}

async function replaceThrough(teacherId, ThroughModel, relatedFk, ids, transaction) {
  await ThroughModel.destroy({ where: { teacher_id: teacherId }, transaction });
  if (!ids.length) return;
  await ThroughModel.bulkCreate(
    ids.map((rid) => ({ teacher_id: teacherId, [relatedFk]: rid })),
    { transaction }
  );
}

async function syncTeacherRelations(teacherId, body, transaction) {
  const departmentIds = normalizeUuidArray(body.department_ids);
  const curriculumIds = normalizeUuidArray(body.curriculum_ids);
  const curriculumSubjectIds = normalizeUuidArray(body.curriculum_subject_ids);
  const curriculumClassIds = normalizeUuidArray(body.curriculum_class_ids);

  if (departmentIds !== undefined) {
    await assertAllIdsExist(Department, departmentIds, "department");
    await replaceThrough(teacherId, TeacherDepartment, "department_id", departmentIds, transaction);
  }
  if (curriculumIds !== undefined) {
    await assertAllIdsExist(Curriculum, curriculumIds, "curriculum");
    await replaceThrough(teacherId, TeacherCurriculumJoin, "curriculum_id", curriculumIds, transaction);
  }
  if (curriculumSubjectIds !== undefined) {
    await assertAllIdsExist(CurriculumSubject, curriculumSubjectIds, "curriculum subject");
    await replaceThrough(teacherId, TeacherCurriculumSubject, "curriculum_subject_id", curriculumSubjectIds, transaction);
  }
  if (curriculumClassIds !== undefined) {
    await assertAllIdsExist(CurriculumClass, curriculumClassIds, "curriculum class");
    await replaceThrough(teacherId, TeacherTeachingCurriculumClass, "curriculum_class_id", curriculumClassIds, transaction);
  }
}

exports.listTeachers = async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { count, rows } = await Teacher.findAndCountAll({
      include: teacherProfileIncludes,
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });
    return res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTeacher = async (req, res) => {
  try {
    const row = await Teacher.findByPk(req.params.id, {
      include: teacherProfileIncludes,
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyTeacherProfile = async (req, res) => {
  try {
    const row = await Teacher.findOne({
      where: { user_id: req.user.id },
      include: teacherProfileIncludes,
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Teacher profile not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listTeacherUsersWithoutProfile = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: "teacher" },
      attributes: userExclude,
      include: [
        {
          model: Teacher,
          as: "teacher_profile",
          required: false,
          attributes: ["id"],
        },
      ],
      order: [["full_name", "ASC"]],
    });
    const data = users
      .filter((u) => !u.teacher_profile)
      .map((u) => {
        const j = u.toJSON();
        delete j.teacher_profile;
        return j;
      });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTeacher = async (req, res) => {
  const body = normalizeTeacherRequestBody(req);
  const {
    user_id: bodyUserId,
    username,
    email,
    password,
    full_name,
    phone,
    address,
    profile_image,
    employee_number,
    qualification,
    specialization,
    years_of_experience,
    joining_date,
    salary,
    bank_account_number,
    highest_degree,
    department_ids,
    curriculum_ids,
    curriculum_subject_ids,
    curriculum_class_ids,
  } = body;

  let profile_picture = null;
  const picResolved = resolveTeacherProfilePicture(req, null);
  if (picResolved !== undefined) profile_picture = picResolved;

  if (!employee_number || !qualification) {
    return res.status(400).json({
      success: false,
      message: "employee_number and qualification are required",
    });
  }

  if (bodyUserId) {
    const t = await sequelize.transaction();
    try {
      const homeroom = await resolveHomeroomForCreate(body, t);

      const user = await User.findByPk(bodyUserId, { transaction: t });
      if (!user || user.role !== "teacher") {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "user_id must reference an existing user with role teacher",
        });
      }
      const existingProfile = await Teacher.findOne({ where: { user_id: bodyUserId }, transaction: t });
      if (existingProfile) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "This user already has a teacher profile",
        });
      }

      const teacher = await Teacher.create(
        {
          user_id: bodyUserId,
          employee_number,
          qualification,
          specialization,
          years_of_experience,
          joining_date,
          salary,
          bank_account_number,
          highest_degree,
          profile_picture,
          ...homeroom,
        },
        { transaction: t }
      );

      await syncTeacherRelations(
        teacher.id,
        {
          department_ids: department_ids ?? [],
          curriculum_ids: curriculum_ids ?? [],
          curriculum_subject_ids: curriculum_subject_ids ?? [],
          curriculum_class_ids: curriculum_class_ids ?? [],
        },
        t
      );

      await t.commit();

      const created = await Teacher.findByPk(teacher.id, {
        include: teacherProfileIncludes,
      });
      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      await t.rollback();
      const status = error.statusCode || 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  if (!username || !email || !password || !full_name) {
    return res.status(400).json({
      success: false,
      message:
        "Either provide user_id to link an existing teacher user account, or send username, email, password, and full_name to create a new account and profile together",
    });
  }

  const emailNorm = normalizeEmail(email);
  const usernameNorm = normalizeUsername(username);
  const dup = await User.findOne({ where: duplicateUserWhere(email, username) });
  if (dup) {
    return res.status(400).json({ success: false, message: "Email or username already in use" });
  }

  const t = await sequelize.transaction();
  try {
    const homeroom = await resolveHomeroomForCreate(body, t);

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        username: usernameNorm,
        email: emailNorm,
        password_hash,
        role: "teacher",
        full_name,
        phone,
        address,
        profile_image: profile_image || null,
      },
      { transaction: t }
    );

    const teacher = await Teacher.create(
      {
        user_id: user.id,
        employee_number,
        qualification,
        specialization,
        years_of_experience,
        joining_date,
        salary,
        bank_account_number,
        highest_degree,
        profile_picture,
        ...homeroom,
      },
      { transaction: t }
    );

    await syncTeacherRelations(
      teacher.id,
      {
        department_ids: department_ids ?? [],
        curriculum_ids: curriculum_ids ?? [],
        curriculum_subject_ids: curriculum_subject_ids ?? [],
        curriculum_class_ids: curriculum_class_ids ?? [],
      },
      t
    );

    await t.commit();

    const created = await Teacher.findByPk(teacher.id, {
      include: teacherProfileIncludes,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await t.rollback();
    const status = error.statusCode || 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateTeacher = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacher = await Teacher.findByPk(req.params.id, { transaction: t });
    if (!teacher) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    const body = normalizeTeacherRequestBody(req);

    const fields = [
      "employee_number",
      "qualification",
      "specialization",
      "years_of_experience",
      "joining_date",
      "salary",
      "bank_account_number",
      "highest_degree",
    ];
    const patch = {};
    for (const key of fields) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const pic = resolveTeacherProfilePicture(req, teacher);
    if (pic !== undefined) patch.profile_picture = pic;

    if (Object.keys(patch).length) {
      await teacher.update(patch, { transaction: t });
    }

    const homeroomPatch = await resolveHomeroomForUpdate(body, teacher, t);
    if (homeroomPatch) {
      await teacher.update(homeroomPatch, { transaction: t });
    }

    const relKeys = ["department_ids", "curriculum_ids", "curriculum_subject_ids", "curriculum_class_ids"];
    const hasRel = relKeys.some((k) => body[k] !== undefined);
    if (hasRel) {
      await syncTeacherRelations(teacher.id, body, t);
    }

    let userPayload = req.body.user;
    if (typeof userPayload === "string") {
      try {
        userPayload = JSON.parse(userPayload);
      } catch {
        userPayload = null;
      }
    }
    if (userPayload && teacher.user_id) {
      const user = await User.findByPk(teacher.user_id, { transaction: t });
      if (user) {
        const u = userPayload;
        const allowed = ["full_name", "phone", "address", "profile_image", "email", "username"];
        const userPatch = {};
        for (const key of allowed) {
          if (u[key] !== undefined) userPatch[key] = u[key];
        }
        if (userPatch.email !== undefined) userPatch.email = normalizeEmail(userPatch.email);
        if (userPatch.username !== undefined) userPatch.username = normalizeUsername(userPatch.username);
        if (Object.keys(userPatch).length) await user.update(userPatch, { transaction: t });
      }
    }

    await t.commit();

    const updated = await Teacher.findByPk(teacher.id, {
      include: teacherProfileIncludes,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    await t.rollback();
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteTeacher = async (req, res) => {
  const deleteUserAccount =
    req.query.delete_user_account === "true" ||
    req.query.delete_user_account === "1" ||
    req.body?.delete_user_account === true ||
    req.query.keep_user === "false" ||
    req.query.keep_user === "0";

  const keepUser = !deleteUserAccount;

  const t = await sequelize.transaction();
  try {
    const teacher = await Teacher.findByPk(req.params.id, { transaction: t });
    if (!teacher) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }
    const userId = teacher.user_id;
    const picPath = teacher.profile_picture;

    await Department.update({ head_of_department: null }, { where: { head_of_department: teacher.id }, transaction: t });
    await Student.update({ class_teacher_id: null }, { where: { class_teacher_id: teacher.id }, transaction: t });

    await teacher.destroy({ transaction: t });

    if (!keepUser) {
      await User.destroy({ where: { id: userId }, transaction: t });
    }

    await t.commit();

    if (picPath) unlinkProfilePictureIfExists(picPath);

    return res.json({
      success: true,
      message: keepUser
        ? "Teacher profile removed; user account kept (can link a new profile later)."
        : "Teacher profile and user account deleted.",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.publicListTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.findAll({
      include: teacherProfileIncludes,
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: teachers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

