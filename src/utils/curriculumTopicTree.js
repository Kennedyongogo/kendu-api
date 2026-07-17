/** Sort subtopics for stable API output. */
function sortSubtopicsPlain(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const oa = a.order_index ?? 0;
    const ob = b.order_index ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

/**
 * @param {import("sequelize").Model|object} topicRow — topic instance with optional `subtopics` association loaded
 */
function serializeTopicWithSubtopics(topicRow) {
  const j = topicRow.toJSON ? topicRow.toJSON() : { ...topicRow };
  j.subtopics = sortSubtopicsPlain(j.subtopics || []);
  return j;
}

module.exports = { sortSubtopicsPlain, serializeTopicWithSubtopics };
