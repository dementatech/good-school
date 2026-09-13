/* eslint-disable */
exports.shorthands = undefined;

// Redesign: grading_scheme was per-school (Step 2's own choice). Corrected
// to match subject/subject_variant/combination's shape instead — a
// curriculum-wide catalog only a super-admin manages; a school just PICKS
// one per phase from a dropdown ("Change Grade System"), recorded in the
// new school_grading_scheme table.
//
// Also: A-Level principal and subsidiary subjects are NOT the same scale.
// Principal: A-E letters worth 5/4/3/2/1 points. Subsidiary (and General
// Paper): a 2-band Fail/Pass worth 0/1 points — not a cut-down version of
// the principal scale, a different scheme entirely. `grading_scheme.role_scope`
// ('any'|'principal'|'subsidiary') captures this: O-Level schemes are
// always 'any' (no principal/subsidiary concept there); A-Level needs two
// catalog rows to cover one phase, because the BANDS differ, not just which
// one got picked. Resolving which applies to a given (student, subject) at
// publish time is grading-schemes.repository.ts's resolveSubjectRoleScope.
//
// grade_band also gains `comment` — the sentence shown on a report card
// ("Excellent", "Subsidiary Pass"), distinct from the short `label` ("A").
//
// Still testing-phase: no real grades depend on Step 2's per-school seed,
// so this replaces it outright (delete + reseed) rather than migrating it.
// Any exam_result row already carrying a computed_grade/grading_scheme_id
// from the old model is cleared — those schemes are about to stop
// existing, so a stale grade is worse than none; re-publish recomputes.

exports.up = (pgm) => {
  pgm.sql(`update exam_result set computed_grade = null, grading_scheme_id = null`);
  pgm.sql(`drop index if exists grading_scheme_one_active`);
  pgm.sql(`delete from grading_scheme`); // cascades to grade_band

  pgm.dropColumns("grading_scheme", ["school_id"]);
  pgm.addColumns("grading_scheme", {
    role_scope: { type: "text", notNull: true, default: "any" },
  });
  pgm.addConstraint("grading_scheme", "grading_scheme_role_scope_check", {
    check: "role_scope in ('any', 'principal', 'subsidiary')",
  });

  pgm.addColumns("grade_band", {
    comment: { type: "text" },
  });
  // Table is empty (cascaded above) — safe to require every band carry one
  // going forward without a backfill.
  pgm.alterColumn("grade_band", "comment", { notNull: true });

  pgm.createTable("school_grading_scheme", {
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    applies_to: { type: "text", notNull: true },
    role_scope: { type: "text", notNull: true },
    grading_scheme_id: { type: "uuid", notNull: true, references: "grading_scheme", onDelete: "restrict" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("school_grading_scheme", "school_grading_scheme_pkey", {
    primaryKey: ["school_id", "applies_to", "role_scope"],
  });
  pgm.addConstraint("school_grading_scheme", "school_grading_scheme_role_scope_check", {
    check: "role_scope in ('any', 'principal', 'subsidiary')",
  });

  // -- Seed the catalog, per curriculum --------------------------------------

  pgm.sql(`
    insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
    select distinct cur.id, 'nlsc_a_e', 'O_LEVEL', 'any', 'NLSC O-Level', true
      from curriculum cur
      where exists (select 1 from curriculum_stage cs where cs.curriculum_id = cur.id and cs.phase = 'O_LEVEL')
  `);
  pgm.sql(`
    insert into grade_band (grading_scheme_id, label, min_pct, max_pct, comment)
    select gs.id, band.label, band.min_pct, band.max_pct, band.comment
      from grading_scheme gs
      cross join (values
        ('E', 0.00, 49.99, 'Weak'),
        ('D', 50.00, 59.99, 'Fair'),
        ('C', 60.00, 69.99, 'Good'),
        ('B', 70.00, 79.99, 'Very Good'),
        ('A', 80.00, 100.00, 'Excellent')
      ) as band(label, min_pct, max_pct, comment)
     where gs.name = 'NLSC O-Level'
  `);

  pgm.sql(`
    insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
    select distinct cur.id, 'nlsc_a_e', 'A_LEVEL', 'principal', 'NLSC A-Level (Principal)', true
      from curriculum cur
      where exists (select 1 from curriculum_stage cs where cs.curriculum_id = cur.id and cs.phase = 'A_LEVEL')
  `);
  pgm.sql(`
    insert into grade_band (grading_scheme_id, label, min_pct, max_pct, points, comment)
    select gs.id, band.label, band.min_pct, band.max_pct, band.points, band.comment
      from grading_scheme gs
      cross join (values
        ('E', 0.00, 49.99, 1, 'Weak'),
        ('D', 50.00, 59.99, 2, 'Fair'),
        ('C', 60.00, 69.99, 3, 'Good'),
        ('B', 70.00, 79.99, 4, 'Very Good'),
        ('A', 80.00, 100.00, 5, 'Excellent')
      ) as band(label, min_pct, max_pct, points, comment)
     where gs.name = 'NLSC A-Level (Principal)'
  `);

  pgm.sql(`
    insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
    select distinct cur.id, 'nlsc_a_e', 'A_LEVEL', 'subsidiary', 'NLSC A-Level (Subsidiary)', true
      from curriculum cur
      where exists (select 1 from curriculum_stage cs where cs.curriculum_id = cur.id and cs.phase = 'A_LEVEL')
  `);
  pgm.sql(`
    insert into grade_band (grading_scheme_id, label, min_pct, max_pct, points, comment)
    select gs.id, band.label, band.min_pct, band.max_pct, band.points, band.comment
      from grading_scheme gs
      cross join (values
        ('Fail', 0.00, 49.99, 0, 'Subsidiary Fail'),
        ('Pass', 50.00, 100.00, 1, 'Subsidiary Pass')
      ) as band(label, min_pct, max_pct, points, comment)
     where gs.name = 'NLSC A-Level (Subsidiary)'
  `);

  // No verified D1-F9/UACE-points cutoffs to seed — kept in the catalog,
  // visible and editable, zero bands, never a default (see header).
  pgm.sql(`
    insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
    select distinct cur.id, 'legacy_1_9', 'A_LEVEL', 'any', 'UACE (Legacy)', true
      from curriculum cur
      where exists (select 1 from curriculum_stage cs where cs.curriculum_id = cur.id and cs.phase = 'A_LEVEL')
  `);

  // -- Every school already on a curriculum gets the new defaults ----------

  pgm.sql(`
    insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
    select sc.school_id, 'O_LEVEL', 'any', gs.id
      from school_curriculum sc
      join grading_scheme gs on gs.curriculum_id = sc.curriculum_id and gs.name = 'NLSC O-Level'
  `);
  pgm.sql(`
    insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
    select sc.school_id, 'A_LEVEL', 'principal', gs.id
      from school_curriculum sc
      join grading_scheme gs on gs.curriculum_id = sc.curriculum_id and gs.name = 'NLSC A-Level (Principal)'
  `);
  pgm.sql(`
    insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
    select sc.school_id, 'A_LEVEL', 'subsidiary', gs.id
      from school_curriculum sc
      join grading_scheme gs on gs.curriculum_id = sc.curriculum_id and gs.name = 'NLSC A-Level (Subsidiary)'
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("school_grading_scheme");
  pgm.dropColumns("grade_band", ["comment"]);
  pgm.sql(`alter table grading_scheme drop constraint if exists grading_scheme_role_scope_check`);
  pgm.dropColumns("grading_scheme", ["role_scope"]);
  pgm.addColumns("grading_scheme", {
    school_id: { type: "uuid", references: "schools", onDelete: "cascade" },
  });
};
