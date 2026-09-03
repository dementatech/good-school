/* eslint-disable */
exports.shorthands = undefined;

// Phase 3B — the A-Level student's single atomic combination choice
// (3 principal + 1 subsidiary + General Paper, all bundled). See
// docs/design/subject-selection-module.md §3.4. Confirming this is what syncs
// `student_subject` rows for every member of the combination — the app layer
// does that sync, not a DB trigger, so it stays visible/debuggable.

exports.up = (pgm) => {
  pgm.createTable("student_combination", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    school_combination_id: {
      type: "uuid",
      notNull: true,
      references: "school_combination",
      onDelete: "restrict",
    },
    // Which of the combination's `role = 'subsidiary'` members this student
    // takes — required only when the combination offers more than one.
    subsidiary_subject_id: { type: "uuid", references: "subject", onDelete: "restrict" },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "cascade",
    },
    status: { type: "text", notNull: true, default: "confirmed" },
    selected_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    confirmed_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("student_combination", "student_combination_status_check", {
    check: "status in ('pending', 'confirmed', 'reassigned')",
  });

  // At most one current (non-reassigned) combination per student per school
  // per year — a switch goes through an explicit reassignment, not a second
  // silent row.
  pgm.createIndex("student_combination", ["student_user_id", "school_id", "academic_year_id"], {
    unique: true,
    name: "student_combination_one_current_per_year",
    where: "status <> 'reassigned'",
  });
  pgm.createIndex("student_combination", "school_combination_id");
};

exports.down = (pgm) => {
  pgm.dropTable("student_combination");
};
