/* eslint-disable */
exports.shorthands = undefined;

// Phase 2A — re-point the per-school structure at the curriculum reference
// layer. `classes` and `streams` are empty (greenfield), so these are plain
// alters, not data migrations.

exports.up = (pgm) => {
  // ── school_curriculum: which curricula a school runs ───────────────────────
  pgm.createTable("school_curriculum", {
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    curriculum_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum",
      onDelete: "restrict",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("school_curriculum", "school_curriculum_pkey", {
    primaryKey: ["school_id", "curriculum_id"],
  });

  // ── terms: number them (Uganda runs exactly 3) ────────────────────────────
  pgm.addColumns("terms", {
    term_number: { type: "integer" },
  });
  pgm.addConstraint("terms", "terms_term_number_check", {
    check: "term_number is null or term_number between 1 and 3",
  });
  pgm.createIndex("terms", ["school_id", "academic_year_id", "term_number"], {
    unique: true,
    name: "terms_school_year_number_unique",
    where: "term_number is not null",
  });

  // ── classes: academic_level_id -> curriculum_stage_id ─────────────────────
  // Dropping the column takes its own index and the composite unique index
  // (which references it) with it.
  pgm.dropConstraint("classes", "classes_academic_level_id_fkey");
  pgm.dropColumns("classes", ["academic_level_id"]);
  pgm.addColumns("classes", {
    curriculum_stage_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum_stage",
      onDelete: "restrict",
    },
    is_active: { type: "boolean", notNull: true, default: true },
  });
  pgm.createIndex("classes", ["school_id", "academic_year_id", "curriculum_stage_id"], {
    unique: true,
    name: "classes_school_year_stage_unique",
  });
  pgm.createIndex("classes", "curriculum_stage_id");

  // ── streams: physical class group gets capacity ───────────────────────────
  pgm.addColumns("streams", {
    capacity: { type: "integer" },
    is_active: { type: "boolean", notNull: true, default: true },
  });

  // ── academic_levels is superseded by curriculum_stage ─────────────────────
  pgm.dropTable("academic_levels");
};

exports.down = (pgm) => {
  pgm.createTable("academic_levels", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    sort_order: { type: "integer", notNull: true, default: 0 },
    stage: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("academic_levels", ["school_id", "code"], { unique: true });
  pgm.createIndex("academic_levels", "school_id");

  pgm.dropColumns("streams", ["capacity", "is_active"]);

  pgm.dropIndex("classes", ["school_id", "academic_year_id", "curriculum_stage_id"], {
    name: "classes_school_year_stage_unique",
  });
  pgm.dropColumns("classes", ["curriculum_stage_id", "is_active"]);
  pgm.addColumns("classes", {
    academic_level_id: { type: "uuid", notNull: true, references: "academic_levels", onDelete: "restrict" },
  });
  pgm.createIndex("classes", ["academic_year_id", "academic_level_id"], {
    unique: true,
    name: "classes_academic_year_id_academic_level_id_unique_index",
  });
  pgm.createIndex("classes", "academic_level_id");

  pgm.dropIndex("terms", ["school_id", "academic_year_id", "term_number"], {
    name: "terms_school_year_number_unique",
  });
  pgm.dropConstraint("terms", "terms_term_number_check");
  pgm.dropColumns("terms", ["term_number"]);

  pgm.dropTable("school_curriculum");
};
