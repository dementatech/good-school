/* eslint-disable */
exports.shorthands = undefined;

// Exams roadmap Step 2 — grading schemes. Turns a raw exam_result.raw_score
// into a letter/points grade WITHOUT hardcoding "grade = D1..F9" or
// "grade = A..E" as an enum — see docs/design/uganda-secondary-school-
// foundations.md §4: Uganda is mid-transition between the legacy numeric
// scale (still governing UACE and recent UCE history) and the newer NLSC
// A-E competence-based scale (current O-Level), and schools also run their
// own internal grading that doesn't necessarily mirror UNEB's rules exactly.
//
//   grading_scheme — per-school (not curriculum-wide like subject_variant):
//                    each school gets its own rows, seeded from defaults,
//                    then freely editable. `curriculum_id` FKs the real
//                    curriculum reference table (future Cambridge/IB
//                    support); `regime` is the free-text legacy_1_9 /
//                    nlsc_a_e distinction — same convention as
//                    curriculum_stage.phase, deliberately not a DB enum
//                    since more regimes/curricula will be added.
//   grade_band     — the bands within a scheme. Validated in
//                    grading-schemes.repository.ts (gapless, non-overlapping,
//                    full 0-100 coverage) — a cross-row invariant, same as
//                    subject_variant's contribution-sums-to-100 rule.
//
// Scope note (this migration/step only): no computed_grade or
// grading_scheme_id column on exam_result yet, and no locking — nothing
// references a scheme yet to lock against or freeze. That's Step 3
// (publish), where "provenance" means freezing a grade at publish time, not
// on every raw save.

exports.up = (pgm) => {
  pgm.createTable("grading_scheme", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    curriculum_id: { type: "uuid", notNull: true, references: "curriculum", onDelete: "restrict" },
    regime: { type: "text", notNull: true }, // 'legacy_1_9' | 'nlsc_a_e', free text — see header
    applies_to: { type: "text", notNull: true }, // 'O_LEVEL' | 'A_LEVEL'
    name: { type: "text", notNull: true },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // One active scheme per school/curriculum/phase — the scheme "in effect"
  // for computing a grade is unambiguous. A school can still keep inactive
  // alternates around (e.g. drafting next year's bands) without conflict.
  pgm.sql(`
    create unique index grading_scheme_one_active
      on grading_scheme (school_id, curriculum_id, applies_to)
      where is_active
  `);

  pgm.createTable("grade_band", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    grading_scheme_id: { type: "uuid", notNull: true, references: "grading_scheme", onDelete: "cascade" },
    label: { type: "text", notNull: true }, // 'A', 'D1', ...
    min_pct: { type: "numeric(5,2)", notNull: true },
    max_pct: { type: "numeric(5,2)", notNull: true },
    points: { type: "integer" }, // nullable — NLSC O-Level bands carry none, UACE/legacy do
    legacy_equivalent: { type: "text" }, // nullable, e.g. 'D1/D2' for cross-reference
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("grade_band", "grade_band_range_check", {
    check: "min_pct >= 0 and max_pct <= 100 and min_pct <= max_pct",
  });
  pgm.createIndex("grade_band", ["grading_scheme_id", "label"], { unique: true });

  // Seed: every school already on a curriculum with an O-Level stage gets an
  // active NLSC O-Level scheme, using the bands explicitly stated in the
  // design doc (E 0-49, D 50-59, C 60-69, B 70-79, A 80-100 — A's floor
  // inferred by elimination from the doc's own B-E cutoffs). Legacy D1-F9
  // and UACE A-E bands are deliberately NOT seeded here: their exact
  // percentage cutoffs aren't in the design doc, and fabricating real
  // regulatory grading boundaries is worse than leaving them for a school/
  // super-admin to fill in with numbers they can verify. The A-Level scheme
  // row is still created (so it exists and is selectable) with zero bands.
  //
  // Known gap, not solved here: this only backfills schools that exist
  // today. A school adopting a curriculum afterward won't get auto-seeded
  // schemes — same manual-setup precedent as subjects/combinations today.
  pgm.sql(`
    insert into grading_scheme (school_id, curriculum_id, regime, applies_to, name)
    select distinct sc.school_id, sc.curriculum_id, 'nlsc_a_e', 'O_LEVEL', 'NLSC O-Level (default)'
      from school_curriculum sc
      where exists (
        select 1 from curriculum_stage cs
         where cs.curriculum_id = sc.curriculum_id and cs.phase = 'O_LEVEL'
      )
  `);
  pgm.sql(`
    insert into grade_band (grading_scheme_id, label, min_pct, max_pct)
    select gs.id, band.label, band.min_pct, band.max_pct
      from grading_scheme gs
      cross join (values
        ('A', 80.00, 100.00),
        ('B', 70.00, 79.99),
        ('C', 60.00, 69.99),
        ('D', 50.00, 59.99),
        ('E', 0.00, 49.99)
      ) as band(label, min_pct, max_pct)
     where gs.regime = 'nlsc_a_e' and gs.applies_to = 'O_LEVEL' and gs.name = 'NLSC O-Level (default)'
  `);

  pgm.sql(`
    insert into grading_scheme (school_id, curriculum_id, regime, applies_to, name)
    select distinct sc.school_id, sc.curriculum_id, 'legacy_1_9', 'A_LEVEL', 'UACE (default, needs bands)'
      from school_curriculum sc
      where exists (
        select 1 from curriculum_stage cs
         where cs.curriculum_id = sc.curriculum_id and cs.phase = 'A_LEVEL'
      )
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("grade_band");
  pgm.dropTable("grading_scheme");
};
