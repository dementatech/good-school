/* eslint-disable */
exports.shorthands = undefined;

// Phase 3B — per-student subject registration. One row per student/subject/
// academic year; a drop is a status transition, never a delete, so S1–S2
// grades/attendance on a since-dropped subject still resolve. Covers both
// O-Level tier 1/2/3 subjects (added directly) and A-Level subjects (synced
// in when a student_combination is confirmed — see the next migration). See
// docs/design/subject-selection-module.md §2.4, docs/design/student-data-model.md §4.

exports.up = (pgm) => {
  pgm.createTable("student_subject", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "restrict" },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "cascade",
    },
    status: { type: "text", notNull: true, default: "active" },
    status_changed_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    status_changed_by: { type: "uuid", references: "users", onDelete: "set null" },
    reason: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("student_subject", "student_subject_status_check", {
    check: "status in ('active', 'dropped', 'added')",
  });
  pgm.createIndex("student_subject", ["student_user_id", "subject_id", "academic_year_id"], {
    unique: true,
    name: "student_subject_student_subject_year_unique",
  });
  pgm.createIndex("student_subject", ["school_id", "academic_year_id", "subject_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("student_subject");
};
