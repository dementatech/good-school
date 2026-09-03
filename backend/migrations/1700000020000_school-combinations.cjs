/* eslint-disable */
exports.shorthands = undefined;

// Phase 3B — a school's A-Level combinations. `subject_combination` (Phase
// 2A) stays the platform-wide catalog (super_admin's "constants" — PCM, HEG,
// …); `school_combination` is the school's own layer on top: either adopted
// from the catalog (`catalog_combination_id` set — members are copied in at
// creation so the school can still tweak them) or fully custom
// (`catalog_combination_id` null). See docs/design/subject-selection-module.md
// §3.1–3.3 — "a school can still define a genuinely custom combination."

exports.up = (pgm) => {
  pgm.createTable("school_combination", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "cascade",
    },
    // Nullable — provenance only, never a live join. Null means school-defined.
    catalog_combination_id: {
      type: "uuid",
      references: "subject_combination",
      onDelete: "set null",
    },
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    is_offered: { type: "boolean", notNull: true, default: true },
    min_class_size: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("school_combination", ["school_id", "academic_year_id", "code"], {
    unique: true,
    name: "school_combination_school_year_code_unique",
  });

  pgm.createTable("school_combination_subject", {
    school_combination_id: {
      type: "uuid",
      notNull: true,
      references: "school_combination",
      onDelete: "cascade",
    },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "restrict" },
    // 'principal' | 'subsidiary' | 'compulsory' (General Paper) — same roles
    // as the catalog's combination_subject.
    role: { type: "text", notNull: true },
  });
  pgm.addConstraint("school_combination_subject", "school_combination_subject_pkey", {
    primaryKey: ["school_combination_id", "subject_id"],
  });
  pgm.addConstraint("school_combination_subject", "school_combination_subject_role_check", {
    check: "role in ('principal', 'subsidiary', 'compulsory')",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("school_combination_subject");
  pgm.dropTable("school_combination");
};
