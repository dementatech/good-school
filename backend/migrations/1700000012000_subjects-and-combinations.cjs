/* eslint-disable */
exports.shorthands = undefined;

// Phase 2A — the subject catalog + A-Level principal/subsidiary combinations
// (see uganda-secondary-school-foundations.md §3.2, §3.3). Structure only;
// per-student subject/combination registration is a later phase.

exports.up = (pgm) => {
  pgm.createTable("subject", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    curriculum_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum",
      onDelete: "cascade",
    },
    code: { type: "text", notNull: true }, // 'MATH', 'PHY'
    name: { type: "text", notNull: true },
    // 'language' | 'science' | 'humanity' | 'vocational' | 'core' | 'general'
    category: { type: "text", notNull: true, default: "core" },
    is_examinable: { type: "boolean", notNull: true, default: true },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("subject", ["curriculum_id", "code"], { unique: true });

  // Which stages a subject is offered at (Physics: S3–S6).
  pgm.createTable("subject_stage", {
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "cascade" },
    curriculum_stage_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum_stage",
      onDelete: "cascade",
    },
  });
  pgm.addConstraint("subject_stage", "subject_stage_pkey", {
    primaryKey: ["subject_id", "curriculum_stage_id"],
  });

  pgm.createTable("subject_combination", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    curriculum_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum",
      onDelete: "cascade",
    },
    code: { type: "text", notNull: true }, // 'PCM', 'HEG'
    name: { type: "text", notNull: true },
    description: { type: "text" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("subject_combination", ["curriculum_id", "code"], { unique: true });

  pgm.createTable("combination_subject", {
    combination_id: {
      type: "uuid",
      notNull: true,
      references: "subject_combination",
      onDelete: "cascade",
    },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "cascade" },
    // 'principal' | 'subsidiary' | 'compulsory' — drives UACE points weighting.
    role: { type: "text", notNull: true },
  });
  pgm.addConstraint("combination_subject", "combination_subject_pkey", {
    primaryKey: ["combination_id", "subject_id"],
  });
  pgm.addConstraint("combination_subject", "combination_subject_role_check", {
    check: "role in ('principal', 'subsidiary', 'compulsory')",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("combination_subject");
  pgm.dropTable("subject_combination");
  pgm.dropTable("subject_stage");
  pgm.dropTable("subject");
};
