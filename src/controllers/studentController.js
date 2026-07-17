const bcrypt = require("bcryptjs");
const {
  sequelize,
  User,
  Student,
  Teacher,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
} = require("../models");
const { normalizeEmail, normalizeUsername, duplicateUserWhere } = require("../utils/userIdentity");
const { convertToRelativePath } = require("../utils/filePath");
const { unlinkProfilePictureIfExists } = require("../utils/profilePictureStorage");
const {
  recordAdmissionPlacement,
  recordPlacementChange,
  REGISTRATION_REASONS,
} = require("../utils/studentPlacementRegisterService");

const userExclude = { exclude: ["password_hash"] };

const studentListIncludes = [
  { model: User, as: "user", attributes: userExclude },
  {
    model: Teacher,
    as: "class_teacher",
    required: false,
    include: [{ model: User, as: "user", attributes: userExclude }],
  },
  { model: Curriculum, as: "curriculum", attributes: ["id", "name", "type"], required: false },
  {
    model: CurriculumClass,
    as: "curriculum_class",
    attributes: ["id", "name", "code", "curriculum_id"],
    required: false,
  },
  {
    model: CurriculumClassLevel,
    as: "curriculum_class_level",
    attributes: ["id", "name", "level_order", "curriculum_class_id", "start_date", "end_date"],
    required: false,
  },
];

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

async function resolvePlacementFromClassId(curriculumClassId, curriculumIdHint) {
  const cc = await CurriculumClass.findByPk(curriculumClassId, {
    attributes: ["id", "curriculum_id"],
  });
  if (!cc) return { error: "Curriculum class not found" };
  if (curriculumIdHint && curriculumIdHint !== cc.curriculum_id) {
    return { error: "Selected class does not belong to the chosen curriculum" };
  }
  return { curriculum_id: cc.curriculum_id, curriculum_class_id: cc.id };
}

async function resolveLevelForClass(curriculumClassId, levelIdRaw) {
  const levelId =
    levelIdRaw != null && String(levelIdRaw).trim() !== "" ? String(levelIdRaw).trim() : null;
  if (!levelId) return { curriculum_class_level_id: null };
  const level = await CurriculumClassLevel.findByPk(levelId, {
    attributes: ["id", "curriculum_class_id"],
  });
  if (!level) return { error: "Invalid curriculum_class_level_id" };
  if (String(level.curriculum_class_id) !== String(curriculumClassId)) {
    return { error: "Term/level does not belong to the selected class" };
  }
  return { curriculum_class_level_id: level.id };
}

/** Apply curriculum / class updates from body; ignores client-supplied class_teacher_id. */
async function curriculumPlacementPatch(student, body) {
  const rawClass = body.curriculum_class_id;
  const currBody = body.curriculum_id;

  const classProvided =
    rawClass !== undefined && rawClass !== null && String(rawClass).trim() !== "";

  if (classProvided) {
    const hint = currBody !== undefined ? currBody : student.curriculum_id;
    const pl = await resolvePlacementFromClassId(rawClass, hint || undefined);
    if (pl.error) return pl;
    const classTeacherId = await resolveHomeroomTeacherId(pl.curriculum_class_id);
    return {
      curriculum_id: pl.curriculum_id,
      curriculum_class_id: pl.curriculum_class_id,
      class_teacher_id: classTeacherId,
    };
  }

  if (currBody !== undefined && currBody !== student.curriculum_id) {
    const sid = student.curriculum_class_id;
    if (!sid) {
      return {
        error: "Student has no curriculum class assigned; send curriculum_class_id together with the curriculum pathway change",
      };
    }
    const pl = await resolvePlacementFromClassId(sid, currBody);
    if (pl.error) return pl;
    const classTeacherId = await resolveHomeroomTeacherId(sid);
    return {
      curriculum_id: pl.curriculum_id,
      curriculum_class_id: sid,
      class_teacher_id: classTeacherId,
    };
  }

  return null;
}

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return !!v;
}

function normalizeStudentRequestBody(req) {
  const b = { ...req.body };
  if (typeof b.user === "string") {
    try {
      b.user = JSON.parse(b.user);
    } catch {
      b.user = {};
    }
  }
  if (b.is_alumni !== undefined) b.is_alumni = coerceBool(b.is_alumni);
  if (b.graduation_year !== undefined && b.graduation_year !== "") {
    const n = parseInt(String(b.graduation_year), 10);
    if (!Number.isNaN(n)) b.graduation_year = n;
  } else if (b.graduation_year === "") {
    b.graduation_year = null;
  }
  return b;
}

function resolveStudentProfilePicture(req, existingStudent) {
  if (req.file?.path) {
    const rel = convertToRelativePath(req.file.path);
    if (existingStudent?.profile_picture && existingStudent.profile_picture !== rel) {
      unlinkProfilePictureIfExists(existingStudent.profile_picture);
    }
    return rel;
  }
  if (req.body.profile_picture !== undefined) {
    const v = req.body.profile_picture;
    if (v === "" || v === null) {
      if (existingStudent?.profile_picture) unlinkProfilePictureIfExists(existingStudent.profile_picture);
      return null;
    }
    const s = String(v).trim();
    return s || null;
  }
  return undefined;
}

exports.listStudents = async (req, res) => {
  try {
    const classIdRaw = req.query.curriculum_class_id;
    const levelIdRaw = req.query.curriculum_class_level_id;
    const hasClassFilter = classIdRaw != null && String(classIdRaw).trim() !== "";
    const hasLevelFilter = levelIdRaw != null && String(levelIdRaw).trim() !== "";

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitCap = hasClassFilter ? 500 : 100;
    const rawLimit = parseInt(req.query.limit, 10);
    const defaultLimit = hasClassFilter ? 500 : 10;
    const limit = Math.min(
      limitCap,
      Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit)
    );
    const offset = (page - 1) * limit;

    const where = {};
    if (hasClassFilter) {
      where.curriculum_class_id = String(classIdRaw).trim();
    }
    if (hasLevelFilter) {
      where.curriculum_class_level_id = String(levelIdRaw).trim();
    }

    const { count, rows } = await Student.findAndCountAll({
      where,
      include: studentListIncludes,
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

exports.getStudent = async (req, res) => {
  try {
    const row = await Student.findByPk(req.params.id, {
      include: studentListIncludes,
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStudentProfile = async (req, res) => {
  try {
    const row = await Student.findOne({
      where: { user_id: req.user.id },
      include: studentListIncludes,
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Users with role `student` who do not yet have a row in `students` (link when creating a student profile). */
exports.listStudentUsersWithoutProfile = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: "student" },
      attributes: userExclude,
      include: [
        {
          model: Student,
          as: "student_profile",
          required: false,
          attributes: ["id"],
        },
      ],
      order: [["full_name", "ASC"]],
    });
    const data = users
      .filter((u) => !u.student_profile)
      .map((u) => {
        const j = u.toJSON();
        delete j.student_profile;
        return j;
      });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createStudent = async (req, res) => {
  const body = normalizeStudentRequestBody(req);
  const {
    user_id: bodyUserId,
    username,
    email,
    password,
    full_name,
    phone,
    address,
    profile_image,
    admission_number,
    date_of_birth,
    gender,
    curriculum_id,
    curriculum_class_id,
    curriculum_class_level_id,
    enrollment_date,
    graduation_year,
    blood_group,
    medical_conditions,
    emergency_contact_name,
    emergency_contact_phone,
    is_alumni,
  } = body;

  let profile_picture = null;
  const picResolved = resolveStudentProfilePicture(req, null);
  if (picResolved !== undefined) profile_picture = picResolved;

  if (
    !admission_number ||
    !date_of_birth ||
    !gender ||
    curriculum_class_id === undefined ||
    curriculum_class_id === null ||
    String(curriculum_class_id).trim() === ""
  ) {
    return res.status(400).json({
      success: false,
      message: "admission_number, date_of_birth, gender, and curriculum_class_id are required",
    });
  }

  const placement = await resolvePlacementFromClassId(curriculum_class_id, curriculum_id || undefined);
  if (placement.error) {
    return res.status(400).json({ success: false, message: placement.error });
  }
  const homeroomTeacherId = await resolveHomeroomTeacherId(placement.curriculum_class_id);
  const levelPlacement = await resolveLevelForClass(
    placement.curriculum_class_id,
    body.curriculum_class_level_id
  );
  if (levelPlacement.error) {
    return res.status(400).json({ success: false, message: levelPlacement.error });
  }

  const studentPayload = {
    admission_number,
    date_of_birth,
    gender,
    curriculum_id: placement.curriculum_id,
    curriculum_class_id: placement.curriculum_class_id,
    curriculum_class_level_id: levelPlacement.curriculum_class_level_id,
    enrollment_date,
    graduation_year,
    blood_group,
    medical_conditions,
    emergency_contact_name,
    emergency_contact_phone,
    is_alumni: !!is_alumni,
    class_teacher_id: homeroomTeacherId,
    profile_picture,
  };

  if (bodyUserId) {
    try {
      const user = await User.findByPk(bodyUserId);
      if (!user || user.role !== "student") {
        return res.status(400).json({
          success: false,
          message: "user_id must reference an existing user with role student",
        });
      }
      const existingProfile = await Student.findOne({ where: { user_id: bodyUserId } });
      if (existingProfile) {
        return res.status(400).json({
          success: false,
          message: "This user already has a student profile",
        });
      }
      const student = await Student.create({
        user_id: bodyUserId,
        ...studentPayload,
      });
      await recordAdmissionPlacement(student, { actorUserId: req.user?.id });
      const created = await Student.findByPk(student.id, { include: studentListIncludes });
      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  if (!username || !email || !password || !full_name) {
    return res.status(400).json({
      success: false,
      message:
        "Either provide user_id to link an existing student user, or send username, email, password, and full_name to create a new account",
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
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create(
      {
        username: usernameNorm,
        email: emailNorm,
        password_hash,
        role: "student",
        full_name,
        phone,
        address,
        profile_image: profile_image || null,
      },
      { transaction: t }
    );

    const student = await Student.create(
      {
        user_id: user.id,
        ...studentPayload,
      },
      { transaction: t }
    );

    await recordAdmissionPlacement(student, { actorUserId: req.user?.id, transaction: t });

    await t.commit();

    const created = await Student.findByPk(student.id, { include: studentListIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    await t.rollback();
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const body = normalizeStudentRequestBody(req);

    const studentFields = [
      "admission_number",
      "date_of_birth",
      "gender",
      "enrollment_date",
      "graduation_year",
      "blood_group",
      "medical_conditions",
      "emergency_contact_name",
      "emergency_contact_phone",
      "is_alumni",
    ];
    const patch = {};
    for (const key of studentFields) {
      if (body[key] !== undefined) patch[key] = body[key];
    }

    const placement = await curriculumPlacementPatch(student, body);
    if (placement?.error) {
      return res.status(400).json({ success: false, message: placement.error });
    }
    if (placement) Object.assign(patch, placement);
    if (body.curriculum_class_level_id !== undefined) {
      patch.curriculum_class_level_id = body.curriculum_class_level_id || null;
    }

    if (body.curriculum_class_level_id !== undefined) {
      const classId = patch.curriculum_class_id ?? student.curriculum_class_id;
      if (!classId) {
        return res.status(400).json({
          success: false,
          message: "Assign a curriculum class before setting term/level",
        });
      }
      const levelPlacement = await resolveLevelForClass(classId, body.curriculum_class_level_id);
      if (levelPlacement.error) {
        return res.status(400).json({ success: false, message: levelPlacement.error });
      }
      patch.curriculum_class_level_id = levelPlacement.curriculum_class_level_id;
    }

    const pic = resolveStudentProfilePicture(req, student);
    if (pic !== undefined) patch.profile_picture = pic;

    const nextCurriculumId = patch.curriculum_id ?? student.curriculum_id;
    const nextClassId = patch.curriculum_class_id ?? student.curriculum_class_id;
    const nextLevelId = patch.curriculum_class_level_id ?? student.curriculum_class_level_id;
    const placementChanged =
      String(nextCurriculumId || "") !== String(student.curriculum_id || "") ||
      String(nextClassId || "") !== String(student.curriculum_class_id || "") ||
      String(nextLevelId || "") !== String(student.curriculum_class_level_id || "");

    const t = await sequelize.transaction();
    try {
      if (placementChanged && nextCurriculumId && nextClassId && nextLevelId) {
        await recordPlacementChange(student, {
          curriculumId: nextCurriculumId,
          curriculumClassId: nextClassId,
          curriculumClassLevelId: nextLevelId,
          reason: REGISTRATION_REASONS.PLACEMENT_UPDATE,
          actorUserId: req.user?.id,
          transaction: t,
        });
      }

      await student.update(patch, { transaction: t });

      if (body.user && student.user_id) {
        const user = await User.findByPk(student.user_id, { transaction: t });
        if (user) {
          const u = body.user;
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
    } catch (txError) {
      await t.rollback();
      throw txError;
    }

    const updated = await Student.findByPk(student.id, { include: studentListIncludes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** Default: remove `students` row only (user account kept), like `deleteTeacher` with `keepUser`. Pass `delete_user_account=true` to also remove the user. */
exports.deleteStudent = async (req, res) => {
  const deleteUserAccount =
    req.query.delete_user_account === "true" ||
    req.query.delete_user_account === "1" ||
    req.body?.delete_user_account === true ||
    req.query.keep_user === "false" ||
    req.query.keep_user === "0";

  const keepUser = !deleteUserAccount;

  const t = await sequelize.transaction();
  try {
    const student = await Student.findByPk(req.params.id, { transaction: t });
    if (!student) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    const userId = student.user_id;
    const picPath = student.profile_picture;

    await student.destroy({ transaction: t });

    if (!keepUser) {
      await User.destroy({ where: { id: userId }, transaction: t });
    }

    await t.commit();

    if (picPath) unlinkProfilePictureIfExists(picPath);

    return res.json({
      success: true,
      message: keepUser
        ? "Student profile removed; user account kept (you can link a new profile later)."
        : "Student profile and user account deleted.",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Could not delete student profile (there may still be linked academic or billing records).",
    });
  }
};

