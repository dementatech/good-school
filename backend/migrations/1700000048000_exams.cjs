/* eslint-disable */
exports.shorthands = undefined;

// Exams module — a school examination (Mid-Term, End of Term, Mock, …), as
// opposed to `prior_exam_result` which records national exams a student sat
// BEFORE joining. Same reference-vs-instance split as curriculum /
// school_curriculum and subject_combination / school_combination:
//
//   exam_session  — global catalog, super_admin-managed ("the exam types the
//                   platform offers")
//   school_exam   — a school admin picks an exam_session and creates + activates
//                   an exam for the current term. academic_year_id and term_id
//                   are auto-attached from the school's current year / current
//                   term at creation time.
//
// Several school_exam rows can be active in one term at once. A given
// exam_session may be picked more than once per term as long as the exam
// `name` differs (unique on school+year+term+name). `name` defaults to
// exam_session.exam_name but is editable. The date fields are the hook for a
// later mark-entry module — nothing writes marks yet.

exports.up = (pgm) => {
  pgm.createTable("exam_session", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    exam_name: { type: "text", notNull: true },
    exam_code: { type: "text", notNull: true },
    description: { type: "text" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("exam_session", "exam_code", { unique: true });

  pgm.createTable("school_exam", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    // restrict: a catalog entry a school is actively using can't be deleted
    // out from under it (surfaced as a 409 "in use").
    exam_session_id: {
      type: "uuid",
      notNull: true,
      references: "exam_session",
      onDelete: "restrict",
    },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "restrict",
    },
    term_id: { type: "uuid", notNull: true, references: "terms", onDelete: "restrict" },
    name: { type: "text", notNull: true },
    starts_on: { type: "date", notNull: true },
    ends_on: { type: "date", notNull: true },
    marks_due_on: { type: "date", notNull: true },
    status: { type: "text", notNull: true, default: "active" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("school_exam", "school_exam_status_check", {
    check: "status in ('active','closed')",
  });
  // Exam window then the mark-entry deadline, in order. Editable later, but
  // never out of order.
  pgm.addConstraint("school_exam", "school_exam_date_order_check", {
    check: "starts_on <= ends_on and ends_on <= marks_due_on",
  });

  // One exam per name per term (per school). Picking the same exam_session
  // twice in a term forces a distinct name.
  pgm.createIndex("school_exam", ["school_id", "academic_year_id", "term_id", "name"], {
    unique: true,
    name: "school_exam_term_name_unique",
  });
  // "Which exams is this school running this term".
  pgm.createIndex("school_exam", ["school_id", "academic_year_id", "term_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("school_exam");
  pgm.dropTable("exam_session");
};
