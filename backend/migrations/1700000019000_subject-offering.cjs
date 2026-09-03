/* eslint-disable */
exports.shorthands = undefined;

// Phase 3B — a school's O-Level subject offering: which catalog subjects
// (super_admin's "constants", from `subject`) it actually runs, and which of
// those are compulsory *at this school*. Compulsory-ness and availability are
// per-school, per-year decisions — not global truths on `subject` itself. See
// docs/design/subject-selection-module.md §2.3.

exports.up = (pgm) => {
  pgm.createTable("subject_offering", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "cascade" },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "cascade",
    },
    is_offered: { type: "boolean", notNull: true, default: true },
    is_compulsory: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("subject_offering", ["school_id", "subject_id", "academic_year_id"], {
    unique: true,
    name: "subject_offering_school_subject_year_unique",
  });
  pgm.createIndex("subject_offering", ["school_id", "academic_year_id"]);
};

exports.down = (pgm) => {
  pgm.dropTable("subject_offering");
};
