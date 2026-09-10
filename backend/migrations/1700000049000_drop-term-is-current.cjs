/* eslint-disable */
exports.shorthands = undefined;

// "Current term" is now derived purely from the calendar — the term whose
// [start_date, end_date] window contains today (see terms.repository.ts
// getCurrentTerm). A manual `is_current` flag was a footgun: an admin could
// leave Term 1 flagged into Term 3 and every date-stamped record (and exam
// creation) would silently use the wrong term. The system should just read
// the dates.

exports.up = (pgm) => {
  pgm.dropIndex("terms", "academic_year_id", {
    name: "idx_one_current_term_per_academic_year",
  });
  pgm.dropColumn("terms", "is_current");
};

exports.down = (pgm) => {
  pgm.addColumn("terms", {
    is_current: { type: "boolean", notNull: true, default: false },
  });
  pgm.createIndex("terms", "academic_year_id", {
    unique: true,
    name: "idx_one_current_term_per_academic_year",
    where: "is_current = true",
  });
};
