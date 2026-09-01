/* eslint-disable */
exports.shorthands = undefined;

// Phase 2A foundation — the curriculum abstraction seam (see
// uganda-secondary-school-foundations.md §6). Seeded UNEB-only; Cambridge/IB
// become extra `curriculum` + `curriculum_stage` rows later, not a rewrite.

exports.up = (pgm) => {
  // School-scoped administrator — between platform `admin` and per-school staff.
  // A new enum value cannot be *used* in the same transaction it is added in;
  // migrations here run with --no-single-transaction and nothing below
  // references it, so this is safe in the same file.
  pgm.sql(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'school_admin'`);

  pgm.createTable("curriculum", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    code: { type: "text", notNull: true, unique: true }, // 'UNEB', 'CAMBRIDGE', 'IB'
    name: { type: "text", notNull: true },
    awarding_body: { type: "text" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // The class ladder, as reference data keyed to a curriculum — S1..S6 is
  // national, identical for every UNEB school. A school's own label for a
  // group ("S2 East") lives on `streams`, not here.
  pgm.createTable("curriculum_stage", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    curriculum_id: {
      type: "uuid",
      notNull: true,
      references: "curriculum",
      onDelete: "cascade",
    },
    code: { type: "text", notNull: true }, // 'S1'
    name: { type: "text", notNull: true }, // 'Senior 1'
    sequence_number: { type: "integer", notNull: true }, // 1..6 position in the ladder
    // 'O_LEVEL' | 'A_LEVEL' (or 'LOWER'/'UPPER'/'CHECKPOINT' for other
    // curricula) — free text on purpose, this set will grow.
    phase: { type: "text" },
    age_equivalent_years: { type: "integer" }, // typical age, for cross-curriculum mapping
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("curriculum_stage", ["curriculum_id", "code"], { unique: true });
  pgm.createIndex("curriculum_stage", ["curriculum_id", "sequence_number"], { unique: true });

  // ── Seed: UNEB + Senior 1–6 ────────────────────────────────────────────────
  pgm.sql(`
    insert into curriculum (code, name, awarding_body)
    values ('UNEB', 'Uganda National Curriculum', 'Uganda National Examinations Board');
  `);
  pgm.sql(`
    insert into curriculum_stage (curriculum_id, code, name, sequence_number, phase, age_equivalent_years)
    select c.id, v.code, v.name, v.seq, v.phase, v.age
    from curriculum c
    cross join (values
      ('S1', 'Senior 1', 1, 'O_LEVEL', 12),
      ('S2', 'Senior 2', 2, 'O_LEVEL', 13),
      ('S3', 'Senior 3', 3, 'O_LEVEL', 14),
      ('S4', 'Senior 4', 4, 'O_LEVEL', 15),
      ('S5', 'Senior 5', 5, 'A_LEVEL', 16),
      ('S6', 'Senior 6', 6, 'A_LEVEL', 17)
    ) as v(code, name, seq, phase, age)
    where c.code = 'UNEB';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("curriculum_stage");
  pgm.dropTable("curriculum");
  // Postgres has no DROP VALUE for enums — 'school_admin' is left in place.
};
