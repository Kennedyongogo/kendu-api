/**
 * Seed 25 realistic announcements: 5 per category.
 *
 * Audience totals:
 *   public: 8, students: 9, all: 8
 * Exam announcements are always student-only.
 *
 * Repeatable: rerunning updates these seeded posts by their stable slug.
 *
 * Usage: npm run seed:announcements
 */
require("dotenv").config();
const {
  initializeModels,
  setupAssociations,
  Announcement,
  User,
  sequelize,
} = require("../src/models");

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();

function daysFromNow(days, hour = 9) {
  const value = new Date(now.getTime() + days * DAY_MS);
  value.setHours(hour, 0, 0, 0);
  return value;
}

const NON_EXAM_AUDIENCES = ["public", "students", "all", "public", "all"];

const ANNOUNCEMENTS = [
  // News: 2 public, 1 students, 2 all
  {
    category: "news",
    title: "KASMS welcomes students for the new academic term",
    excerpt: "The school welcomes new and continuing students for another term of learning, service and professional growth.",
    body: "Kendu Adventist School of Medical Sciences warmly welcomes all new and continuing students for the new academic term. Students are encouraged to complete registration, review their class schedules and make use of the academic and student-support services available on campus.",
  },
  {
    category: "news",
    title: "Clinical skills laboratory receives new training equipment",
    excerpt: "New simulation and clinical training equipment has been added to strengthen practical learning.",
    body: "KASMS has expanded its clinical skills laboratory with additional simulation and practical training equipment. The resources will support supervised demonstrations, skills practice and competency-based assessment across relevant programmes.",
  },
  {
    category: "news",
    title: "Student mentorship programme opens for registration",
    excerpt: "Students can now register for academic and professional mentorship sessions.",
    body: "Registration is open for the student mentorship programme. Participating students will be paired with members of staff for guidance on academic planning, clinical professionalism, study habits and career development.",
  },
  {
    category: "news",
    title: "KASMS strengthens community health outreach",
    excerpt: "Students and staff continue serving neighbouring communities through supervised health outreach.",
    body: "The school continues to strengthen its community health outreach activities through health education, screening and referral support. These activities give students valuable supervised exposure while contributing to healthier communities.",
  },
  {
    category: "news",
    title: "Library extends digital learning resources",
    excerpt: "More electronic books, journals and reference materials are now available to the KASMS community.",
    body: "The KASMS library has expanded access to digital learning resources, including electronic textbooks, journals and clinical reference materials. Students should contact the library team for guidance on access and responsible use.",
  },

  // Events: 2 public, 1 students, 2 all
  {
    category: "event",
    title: "KASMS Open Day",
    excerpt: "Prospective students and families are invited to explore programmes, facilities and student life.",
    body: "Join us for the KASMS Open Day. Visitors will meet programme representatives, tour selected learning facilities and receive guidance on admission requirements and the application process.",
    event_date: daysFromNow(18, 9),
    event_end: daysFromNow(18, 15),
  },
  {
    category: "event",
    title: "Community health and wellness day",
    excerpt: "A day of health education, screening and community engagement led by KASMS.",
    body: "KASMS invites the community to a health and wellness day featuring health education, selected screenings and referral guidance. Services will be provided within the available scope and capacity.",
    event_date: daysFromNow(26, 8),
    event_end: daysFromNow(26, 16),
  },
  {
    category: "event",
    title: "Student leadership and professional conduct forum",
    excerpt: "A student forum focused on leadership, ethics, communication and professional conduct.",
    body: "All students are invited to attend a forum on responsible leadership and professional conduct in healthcare training. The programme will include practical discussions, questions and guidance from staff.",
    event_date: daysFromNow(10, 14),
    event_end: daysFromNow(10, 16),
  },
  {
    category: "event",
    title: "Healthcare careers information session",
    excerpt: "Learn about healthcare career pathways and the training opportunities available at KASMS.",
    body: "The healthcare careers information session will help prospective learners and current students understand training pathways, professional expectations and opportunities for continued development.",
    event_date: daysFromNow(34, 10),
    event_end: daysFromNow(34, 13),
  },
  {
    category: "event",
    title: "Annual thanksgiving and dedication service",
    excerpt: "The KASMS community will gather for thanksgiving, reflection and dedication.",
    body: "Students, staff, families and friends of KASMS are welcome to attend the annual thanksgiving and dedication service as the school reflects on progress and commits the coming academic period to service and excellence.",
    event_date: daysFromNow(42, 9),
    event_end: daysFromNow(42, 12),
  },

  // Exams: all 5 are students only
  {
    category: "exam",
    title: "End-of-semester examination timetable released",
    excerpt: "Students should review the examination timetable and report any genuine clashes promptly.",
    body: "The end-of-semester examination timetable is now available. Students must confirm the date, time and venue for every registered unit. Any genuine timetable clash should be reported to the academic office before the stated correction deadline.",
    event_date: daysFromNow(14, 8),
    event_end: daysFromNow(25, 17),
  },
  {
    category: "exam",
    title: "Examination card clearance reminder",
    excerpt: "Complete the required clearance process before collecting or downloading your examination card.",
    body: "Students are reminded to complete all applicable academic and fee-clearance requirements before the examination period. Keep your examination card and student identification available throughout each paper.",
    event_date: daysFromNow(7, 8),
    event_end: daysFromNow(12, 17),
  },
  {
    category: "exam",
    title: "Practical assessment schedule",
    excerpt: "Practical and clinical assessments will begin ahead of the written examination period.",
    body: "Practical and clinical assessments will be conducted according to the departmental schedule. Students should arrive early, wear the required uniform or protective equipment and carry all approved assessment materials.",
    event_date: daysFromNow(9, 8),
    event_end: daysFromNow(13, 17),
  },
  {
    category: "exam",
    title: "Examination conduct and permitted materials",
    excerpt: "Review the rules on reporting time, identification and permitted materials before examinations.",
    body: "Students must report to the examination venue at least thirty minutes before the scheduled start time. Only authorised materials are permitted. Mobile phones, unauthorised notes and other prohibited items must not be taken into the examination room.",
    event_date: daysFromNow(14, 8),
    event_end: daysFromNow(25, 17),
  },
  {
    category: "exam",
    title: "Supplementary examination registration window",
    excerpt: "Eligible students should complete supplementary examination registration within the stated period.",
    body: "Eligible students may submit supplementary examination registration during the stated window. Applications received after the deadline may not be processed. Contact the academic office if clarification is required.",
    event_date: daysFromNow(31, 8),
    event_end: daysFromNow(35, 17),
  },

  // Admissions: 2 public, 1 students, 2 all
  {
    category: "admission",
    title: "Applications open for the next intake",
    excerpt: "Applications are now open for eligible candidates seeking healthcare training at KASMS.",
    body: "KASMS invites applications for the next intake. Prospective students should review programme requirements, prepare the required documents and submit a complete application through the official admission process.",
  },
  {
    category: "admission",
    title: "Admission guidance desk available",
    excerpt: "Prospective applicants can receive guidance on programmes, requirements and application documents.",
    body: "The admission guidance desk is available to help prospective students understand programme options, minimum entry requirements and the documents needed for a complete application.",
  },
  {
    category: "admission",
    title: "Continuing students registration reminder",
    excerpt: "Continuing students should complete semester registration before the deadline.",
    body: "All continuing students are reminded to complete semester registration and confirm their academic details within the registration period. Students experiencing difficulties should contact the relevant office early.",
  },
  {
    category: "admission",
    title: "Document verification dates announced",
    excerpt: "Newly admitted students should present original documents for verification on the scheduled dates.",
    body: "Newly admitted students must present the required original academic and identification documents for verification. Copies should also be provided where requested. Documents must be genuine and consistent with the submitted application.",
    event_date: daysFromNow(21, 8),
    event_end: daysFromNow(23, 16),
  },
  {
    category: "admission",
    title: "Orientation programme for new students",
    excerpt: "New students will receive guidance on academics, student services, conduct and campus life.",
    body: "The orientation programme will introduce new students to academic expectations, student support services, school policies, learning facilities and professional conduct requirements.",
    event_date: daysFromNow(29, 9),
    event_end: daysFromNow(30, 16),
  },

  // General: 2 public, 1 students, 2 all
  {
    category: "general",
    title: "Official communication channels reminder",
    excerpt: "Use official KASMS communication channels when confirming school notices and instructions.",
    body: "Students and members of the public are advised to rely on the official KASMS website, portals and authorised communication channels. Verify unusual messages before acting on them or sharing personal information.",
  },
  {
    category: "general",
    title: "Campus service hours updated",
    excerpt: "Selected campus service points have updated their opening and support hours.",
    body: "Please note the updated service hours for selected administrative and student-support offices. Plan visits within the communicated hours and use the appropriate contact channel for urgent guidance.",
  },
  {
    category: "general",
    title: "Student identification card reminder",
    excerpt: "Students should carry and protect their school identification cards while on campus.",
    body: "All students should carry their valid school identification card while on campus and present it when requested. Lost cards should be reported promptly through the established replacement process.",
  },
  {
    category: "general",
    title: "Scheduled campus maintenance notice",
    excerpt: "Some services may be briefly unavailable during planned maintenance.",
    body: "Planned campus maintenance will be carried out to improve reliability and safety. Temporary interruptions may affect selected facilities or services. Updates will be shared through official channels where necessary.",
    event_date: daysFromNow(6, 8),
    event_end: daysFromNow(6, 14),
  },
  {
    category: "general",
    title: "Feedback and support channels",
    excerpt: "Students and visitors can submit questions or feedback through the appropriate school offices.",
    body: "KASMS welcomes constructive feedback and questions. Please direct academic, admission, finance and student-support matters to the appropriate office so they can be handled efficiently and confidentially.",
  },
];

function stableSlug(category, index) {
  return `sample-${category}-${String(index + 1).padStart(2, "0")}`;
}

async function main() {
  await initializeModels();
  setupAssociations();

  const admin = await User.findOne({
    where: { role: "admin", is_active: true },
    order: [["created_at", "ASC"]],
  });

  console.log("\n🌱 Seeding 25 announcements (5 per category)\n");
  console.log(`  Author: ${admin ? `${admin.full_name} <${admin.email}>` : "none"}`);
  console.log("  Audiences: public 8 · students 9 · everyone 8\n");

  const categoryIndexes = {};
  let created = 0;
  let updated = 0;

  for (const template of ANNOUNCEMENTS) {
    const index = categoryIndexes[template.category] || 0;
    categoryIndexes[template.category] = index + 1;
    const slug = stableSlug(template.category, index);
    const audience =
      template.category === "exam" ? "students" : NON_EXAM_AUDIENCES[index];

    const payload = {
      ...template,
      slug,
      audience,
      is_published: true,
      is_pinned: index === 0,
      published_at: daysFromNow(-(index + 1), 10),
      created_by: admin?.id || null,
      cover_image: null,
    };

    const existing = await Announcement.findOne({ where: { slug } });
    if (existing) {
      await existing.update(payload);
      updated += 1;
      console.log(`  · updated  [${template.category}/${audience}] ${template.title}`);
    } else {
      await Announcement.create(payload);
      created += 1;
      console.log(`  ✓ created  [${template.category}/${audience}] ${template.title}`);
    }
  }

  const counts = await Announcement.count({ group: ["category"] });
  console.log(`\nDone. Created ${created}, updated ${updated}.`);
  console.log("Category totals:", counts);
  await sequelize.close();
}

main().catch(async (error) => {
  console.error("Failed to seed announcements:", error.message);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
