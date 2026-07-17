const { Op } = require("sequelize");
const moment = require("moment");
const {
  User,
  Parent,
  Student,
  Installment,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  Teacher,
} = require("../models");
const { normalizeEmail, normalizeUsername } = require("../utils/userIdentity");
const { getRemainingGraceDays } = require("../utils/gracePeriod");

const userExclude = { exclude: ["password_hash"] };

function normalizeStudentIds(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((id) => String(id).trim()).filter(Boolean))];
  }
  if (input != null && input !== "") {
    return [String(input).trim()];
  }
  return [];
}

async function getGloballyLinkedStudentIds(excludeParentId = null) {
  const rows = await Parent.findAll({ attributes: ["id", "student_ids"] });
  const linked = new Set();
  for (const row of rows) {
    if (excludeParentId && row.id === excludeParentId) continue;
    for (const id of row.student_ids || []) {
      if (id) linked.add(String(id));
    }
  }
  return linked;
}

async function assertStudentsLinkable(studentIdsInput, excludeParentId = null) {
  const studentIds = normalizeStudentIds(studentIdsInput);
  if (!studentIds.length) {
    return { error: "At least one student is required — provide student_ids as an array" };
  }

  const students = await Student.findAll({ where: { id: studentIds } });
  if (students.length !== studentIds.length) {
    return { error: "One or more student_ids are invalid" };
  }

  const linked = await getGloballyLinkedStudentIds(excludeParentId);
  const taken = studentIds.filter((id) => linked.has(id));
  if (taken.length) {
    return {
      error: "One or more students are already linked to another parent profile",
      taken,
    };
  }

  return { studentIds };
}

async function hydrateParent(parentRow) {
  const json = parentRow.toJSON ? parentRow.toJSON() : { ...parentRow };
  const ids = Array.isArray(json.student_ids) ? json.student_ids.filter(Boolean) : [];
  if (!ids.length) {
    json.students = [];
    return json;
  }
  const students = await Student.findAll({
    where: { id: ids },
    include: [
      { model: User, as: "user", attributes: userExclude },
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
        attributes: ["id", "name", "curriculum_class_id"],
        required: false,
      },
      {
        model: Teacher,
        as: "class_teacher",
        required: false,
        include: [{ model: User, as: "user", attributes: userExclude }],
      },
    ],
  });
  const byId = new Map(students.map((s) => [String(s.id), s]));
  json.students = ids.map((id) => byId.get(String(id))).filter(Boolean);
  return json;
}

async function hydrateParents(rows) {
  return Promise.all(rows.map((r) => hydrateParent(r)));
}

const userInclude = { model: User, as: "user", attributes: userExclude };

exports.listParents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();

    const parentWhere = {};
    const userIncludeClause = { ...userInclude, required: false };

    if (search) {
      const like = { [Op.iLike]: `%${search}%` };
      const matchingStudents = await Student.findAll({
        attributes: ["id"],
        include: [
          {
            model: User,
            as: "user",
            attributes: [],
            where: {
              [Op.or]: [{ full_name: like }, { email: like }, { username: like }],
            },
            required: false,
          },
        ],
        where: {
          [Op.or]: [
            { admission_number: like },
            { "$user.full_name$": like },
            { "$user.email$": like },
            { "$user.username$": like },
          ],
        },
        subQuery: false,
      });
      const studentIds = matchingStudents.map((s) => s.id);
      const orClauses = [
        { "$user.full_name$": like },
        { "$user.email$": like },
        { "$user.username$": like },
        { occupation: like },
        { relationship: like },
      ];
      if (studentIds.length) {
        orClauses.push({ student_ids: { [Op.overlap]: studentIds } });
      }
      parentWhere[Op.or] = orClauses;
      userIncludeClause.required = false;
    }

    const { count, rows } = await Parent.findAndCountAll({
      where: parentWhere,
      include: [userIncludeClause],
      order: [["created_at", "DESC"]],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    const data = await hydrateParents(rows);
    return res.json({
      success: true,
      data,
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

/** Students not listed on any parent profile's student_ids. */
exports.listStudentsWithoutParent = async (req, res) => {
  try {
    const linked = await getGloballyLinkedStudentIds();
    const where = linked.size ? { id: { [Op.notIn]: [...linked] } } : {};

    const rows = await Student.findAll({
      where,
      include: [userInclude],
      order: [["created_at", "DESC"]],
      limit: 500,
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listParentUsersWithoutProfile = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: "parent" },
      attributes: userExclude,
      include: [
        {
          model: Parent,
          as: "parent_profiles",
          required: false,
          attributes: ["id"],
        },
      ],
      order: [["full_name", "ASC"]],
    });
    const data = users
      .filter((u) => !u.parent_profiles?.length)
      .map((u) => {
        const j = u.toJSON();
        delete j.parent_profiles;
        return j;
      });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getParent = async (req, res) => {
  try {
    const row = await Parent.findByPk(req.params.id, { include: [userInclude] });
    if (!row) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }
    return res.json({ success: true, data: await hydrateParent(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyParentProfile = async (req, res) => {
  try {
    const row = await Parent.findOne({
      where: { user_id: req.user.id },
      include: [userInclude],
      order: [["created_at", "DESC"]],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }
    return res.json({ success: true, data: await hydrateParent(row) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyStudentsFeeOverview = async (req, res) => {
  try {
    const parentRow = await Parent.findOne({ where: { user_id: req.user.id } });
    if (!parentRow) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const studentIds = [...new Set((parentRow.student_ids || []).filter(Boolean))];
    if (!studentIds.length) {
      return res.json({ success: true, data: [] });
    }

    const students = await Student.findAll({
      where: { id: studentIds },
      include: [userInclude],
    });

    const todayStr = moment().format("YYYY-MM-DD");
    const dashboard = [];

    for (const st of students) {
      const installments = await Installment.findAll({
        where: {
          student_id: st.id,
          balance: { [Op.gt]: 0 },
          status: { [Op.notIn]: ["cancelled", "paid"] },
        },
        order: [["due_date", "ASC"]],
        limit: 24,
      });

      const overdueInst = installments.filter((i) => i.due_date < todayStr);
      let daysOverdue = 0;
      if (overdueInst.length > 0) {
        daysOverdue = Math.max(
          0,
          moment(todayStr).diff(moment(overdueInst[0].due_date).startOf("day"), "days")
        );
      }

      const totalOutstanding = installments.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
      const days_left_in_grace = await getRemainingGraceDays(st.id);

      dashboard.push({
        student_id: st.id,
        student_name: st.user?.full_name,
        account_status: st.account_status,
        reactivation_required: st.reactivation_required,
        total_outstanding: Number(totalOutstanding.toFixed(2)),
        days_overdue: daysOverdue,
        days_left_in_grace,
        installments,
      });
    }

    return res.json({ success: true, data: dashboard });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createParent = async (req, res) => {
  const {
    user_id: bodyUserId,
    student_id,
    student_ids: bodyStudentIds,
    occupation,
    relationship,
    newsletter_subscription,
  } = req.body;

  const idsInput = bodyStudentIds !== undefined ? bodyStudentIds : student_id;

  if (!bodyUserId) {
    return res.status(400).json({
      success: false,
      message: "user_id is required — select an existing parent user account",
    });
  }

  if (!relationship) {
    return res.status(400).json({ success: false, message: "relationship is required" });
  }

  const linkCheck = await assertStudentsLinkable(idsInput);
  if (linkCheck.error) {
    return res.status(400).json({ success: false, message: linkCheck.error });
  }

  try {
    const user = await User.findByPk(bodyUserId);
    if (!user || user.role !== "parent") {
      return res.status(400).json({
        success: false,
        message: "user_id must reference an existing user with role parent",
      });
    }

    const parent = await Parent.create({
      user_id: bodyUserId,
      student_ids: linkCheck.studentIds,
      occupation: occupation || null,
      relationship,
      newsletter_subscription: newsletter_subscription !== false,
    });

    const created = await Parent.findByPk(parent.id, { include: [userInclude] });
    return res.status(201).json({ success: true, data: await hydrateParent(created) });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateParent = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.id);
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }

    const fields = ["occupation", "relationship", "newsletter_subscription"];
    const patch = {};
    for (const key of fields) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    if (req.body.student_ids !== undefined || req.body.student_id !== undefined) {
      const idsInput =
        req.body.student_ids !== undefined ? req.body.student_ids : req.body.student_id;
      const linkCheck = await assertStudentsLinkable(idsInput, parent.id);
      if (linkCheck.error) {
        return res.status(400).json({ success: false, message: linkCheck.error });
      }
      patch.student_ids = linkCheck.studentIds;
    }

    await parent.update(patch);

    if (req.body.user && parent.user_id) {
      const user = await User.findByPk(parent.user_id);
      if (user) {
        const u = req.body.user;
        const allowed = ["full_name", "phone", "address", "profile_image", "email", "username"];
        const userPatch = {};
        for (const key of allowed) {
          if (u[key] !== undefined) userPatch[key] = u[key];
        }
        if (userPatch.email !== undefined) userPatch.email = normalizeEmail(userPatch.email);
        if (userPatch.username !== undefined) userPatch.username = normalizeUsername(userPatch.username);
        if (Object.keys(userPatch).length) await user.update(userPatch);
      }
    }

    const updated = await Parent.findByPk(parent.id, { include: [userInclude] });
    return res.json({ success: true, data: await hydrateParent(updated) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.hydrateParent = hydrateParent;
exports.hydrateParents = hydrateParents;

exports.deleteParent = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.id);
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }
    await parent.destroy();
    return res.json({
      success: true,
      message: "Parent profile removed; user account kept (you can link a new profile later).",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
