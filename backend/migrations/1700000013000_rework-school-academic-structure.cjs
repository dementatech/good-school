/* eslint-disable */
exports.shorthands = undefined;

// Phase 2A — re-point the per-school structure at the curriculum reference
// layer. `classes` rows that already exist are migrated: the school's old
// per-school `academic_levels` row is matched to a UNEB `curriculum_stage`
// (S1–S6) by the number in its code, and anything that can't be matched
// aborts the migration with an instruction rather than guessing.

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

  // Every school that already has classes runs UNEB — record that so the new
  // FK checks in the academic-structure module pass for existing data.
  pgm.sql(`
    insert into school_curriculum (school_id, curriculum_id)
    select distinct c.school_id, cur.id
      from classes c
      cross join curriculum cur
     where cur.code = 'UNEB'
    on conflict do nothing;
  `);

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
  // Add the new column nullable, backfill from existing rows, THEN enforce
  // NOT NULL — so a database that already has classes migrates instead of
  // failing on the constraint.
  pgm.addColumns("classes", {
    curriculum_stage_id: {
      type: "uuid",
      references: "curriculum_stage",
      onDelete: "restrict",
    },
    is_active: { type: "boolean", notNull: true, default: true },
  });

  pgm.sql(`
    update classes c
       set curriculum_stage_id = cs.id
      from academic_levels al
      join curriculum cur on cur.code = 'UNEB'
      join curriculum_stage cs
        on cs.curriculum_id = cur.id
       and cs.code = 'S' || substring(al.code from '[1-6]')
     where c.academic_level_id = al.id
       and c.curriculum_stage_id is null
       and substring(al.code from '[1-6]') is not null;
  `);

  pgm.sql(`
    do $$
    declare unmapped int;
    begin
      select count(*) into unmapped from classes where curriculum_stage_id is null;
      if unmapped > 0 then
        raise exception
          'Migration 1700000013000: % class row(s) have an academic_levels.code with no digit 1-6 to match a UNEB stage. Rename those academic_levels.code values to include the Senior number (e.g. ''S5''), or delete/re-assign the affected classes, then re-run.', unmapped;
      end if;
    end $$;
  `);

  // Dropping the old column also drops its own index and the composite unique
  // index that referenced it.
  pgm.dropConstraint("classes", "classes_academic_level_id_fkey");
  pgm.dropColumns("classes", ["academic_level_id"]);
  pgm.alterColumn("classes", "curriculum_stage_id", { notNull: true });
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
  // Nullable on the way back — the source data (`academic_levels`) was dropped
  // by up(), so there is nothing to backfill this from.
  pgm.addColumns("classes", {
    academic_level_id: { type: "uuid", references: "academic_levels", onDelete: "restrict" },
  });
  pgm.createIndex("classes", "academic_level_id");

  pgm.dropIndex("terms", ["school_id", "academic_year_id", "term_number"], {
    name: "terms_school_year_number_unique",
  });
  pgm.dropConstraint("terms", "terms_term_number_check");
  pgm.dropColumns("terms", ["term_number"]);

  pgm.dropTable("school_curriculum");
};
