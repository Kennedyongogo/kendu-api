const { Op } = require("sequelize");
const {
  Department,
  StaffChannel,
  StaffBriefing,
  StaffBriefingAttachment,
  StaffBriefingRead,
  StaffChannelMessage,
  User,
} = require("../models");

const SCHOOL_CHANNEL_SLUG = "school-wide";

function isAdmin(user) {
  return user?.role === "admin";
}

function attachmentUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) {
    return filename;
  }
  return `/uploads/staff-commons/${filename}`;
}

/** Briefings visible to this user */
function briefingVisibilityWhere(user) {
  if (isAdmin(user)) return {};
  const or = [{ department_id: null }];
  if (user.department_id) or.push({ department_id: user.department_id });
  return { [Op.or]: or };
}

function canAccessChannel(user, channel) {
  if (!channel?.is_active) return false;
  if (isAdmin(user)) return true;
  if (!channel.department_id) return true;
  return user.department_id === channel.department_id;
}

function canPostInChannel(user, channel) {
  if (!canAccessChannel(user, channel)) return false;
  if (isAdmin(user)) return true;
  if (!channel.department_id) return true;
  return user.department_id === channel.department_id;
}

async function ensureStaffChannels() {
  const [schoolChannel] = await StaffChannel.findOrCreate({
    where: { slug: SCHOOL_CHANNEL_SLUG },
    defaults: {
      name: "School-wide",
      slug: SCHOOL_CHANNEL_SLUG,
      department_id: null,
      description: "Announcements and discussion for all staff",
      is_active: true,
    },
  });

  const departments = await Department.findAll({ attributes: ["id", "name", "code"] });
  for (const dept of departments) {
    const slug = `dept-${dept.id}`;
    await StaffChannel.findOrCreate({
      where: { slug },
      defaults: {
        name: dept.name,
        slug,
        department_id: dept.id,
        description: `${dept.name} department channel`,
        is_active: true,
      },
    });
  }

  return schoolChannel;
}

function serializeBriefing(row, extras = {}) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  if (plain.attachments) {
    plain.attachments = plain.attachments.map((a) => {
      const att = a.get ? a.get({ plain: true }) : { ...a };
      att.url = attachmentUrl(att.filename);
      return att;
    });
  }
  if (plain.author) {
    plain.author_name = plain.author.full_name;
  }
  if (plain.department) {
    plain.department_name = plain.department.name;
  }
  return { ...plain, ...extras };
}

function serializeMessage(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  if (plain.author) {
    plain.author_name = plain.author.full_name;
    plain.author_role = plain.author.role;
  }
  return plain;
}

module.exports = {
  SCHOOL_CHANNEL_SLUG,
  isAdmin,
  attachmentUrl,
  briefingVisibilityWhere,
  canAccessChannel,
  canPostInChannel,
  ensureStaffChannels,
  serializeBriefing,
  serializeMessage,
  StaffChannel,
  StaffBriefing,
  StaffBriefingAttachment,
  StaffBriefingRead,
  StaffChannelMessage,
  User,
  Department,
  Op,
};
