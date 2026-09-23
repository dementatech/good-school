/* eslint-disable */
exports.shorthands = undefined;

// Kindergarten + Primary — see docs/design/kindergarten-extension.md and
// docs/design/primary-schools-extension.md. Both are earlier stages of the
// SAME national (UNEB) pathway, so they are new `curriculum_stage` rows
// sequenced before S1, not a parallel structure:
//
//   KINDERGARTEN  Baby / Middle / Top Class          seq 1–3
//   PRIMARY       P1–P7                              seq 4–10
//   O_LEVEL       S1–S4  (renumbered from 1–4)       seq 11–14
//   A_LEVEL       S5–S6  (renumbered from 5–6)       seq 15–16
//
// `phase` stays the level a subject belongs to (so one primary "Mathematics"
// spans P1–P7). Primary's three teaching cycles (lower P1–P3 / transition P4
// / upper P5–P7) are metadata on the stage — the new `cycle` column — not a
// separate qualification tier.
//
// PLE is data, not code: a `grading_scheme` row (per-subject D1–F9 worth
// 1–9 points) whose aggregate/division rule lives on the scheme itself
// (`aggregate_subject_count`, `divisions`), so the in-progress primary
// curriculum reform lands as a new scheme row, not a schema change.
//
// Kindergarten gets NO subjects and NO grading scheme — there is no national
// exam at that stage. Progress is recorded per term against school-editable
// learning areas as a 3-point developmental rating.

exports.up = (pgm) => {
  // ── Schools: which levels they run ────────────────────────────────────────
  pgm.addColumns("schools", {
    offers_kindergarten: { type: "boolean", notNull: true, default: false },
    offers_primary: { type: "boolean", notNull: true, default: false },
  });

  // ── Stages ────────────────────────────────────────────────────────────────
  pgm.addColumns("curriculum_stage", {
    // 'LOWER' | 'TRANSITION' | 'UPPER' for primary; free text like `phase`.
    cycle: { type: "text" },
  });

  // Make room before S1. Old (1–6) and new (11–16) ranges don't overlap, so
  // the per-row unique check on (curriculum_id, sequence_number) never trips.
  pgm.sql(`
    update curriculum_stage cs
       set sequence_number = cs.sequence_number + 10, updated_at = now()
      from curriculum c
     where c.id = cs.curriculum_id and c.code = 'UNEB'
       and cs.phase in ('O_LEVEL', 'A_LEVEL') and cs.sequence_number <= 10
  `);

  pgm.sql(`
    insert into curriculum_stage (curriculum_id, code, name, sequence_number, phase, cycle, age_equivalent_years)
    select c.id, v.code, v.name, v.seq, v.phase, v.cycle, v.age
      from curriculum c
     cross join (values
       ('BABY',   'Baby Class',   1,  'KINDERGARTEN', null,         3),
       ('MIDDLE', 'Middle Class', 2,  'KINDERGARTEN', null,         4),
       ('TOP',    'Top Class',    3,  'KINDERGARTEN', null,         5),
       ('P1',     'Primary 1',    4,  'PRIMARY',      'LOWER',      6),
       ('P2',     'Primary 2',    5,  'PRIMARY',      'LOWER',      7),
       ('P3',     'Primary 3',    6,  'PRIMARY',      'LOWER',      8),
       ('P4',     'Primary 4',    7,  'PRIMARY',      'TRANSITION', 9),
       ('P5',     'Primary 5',    8,  'PRIMARY',      'UPPER',      10),
       ('P6',     'Primary 6',    9,  'PRIMARY',      'UPPER',      11),
       ('P7',     'Primary 7',    10, 'PRIMARY',      'UPPER',      12)
     ) as v(code, name, seq, phase, cycle, age)
     where c.code = 'UNEB'
    on conflict do nothing
  `);

  // ── Primary subject catalog ───────────────────────────────────────────────
  // The four PLE subjects are 'core' (always offered, examinable). Everything
  // else is taught but not PLE-examined — `is_examinable = false` is what the
  // report card's aggregate keys off.
  pgm.sql(`
    insert into subject (curriculum_id, phase, code, short_name, name, category, is_examinable, status)
    select c.id, 'PRIMARY', v.code, v.short_name, v.name, v.category, v.examinable, 'approved'
      from curriculum c
     cross join (values
       ('S001', 'ENG',  'English',                      'core',     true),
       ('S002', 'MTC',  'Mathematics',                  'core',     true),
       ('S003', 'SCI',  'Integrated Science',           'core',     true),
       ('S004', 'SST',  'Social Studies',               'core',     true),
       ('S005', 'LIT',  'Literacy',                     'language', false),
       ('S006', 'LUG',  'Luganda',                      'language', false),
       ('S007', 'RRK',  'Runyankore-Rukiga',            'language', false),
       ('S008', 'CRE',  'Christian Religious Education', 'religion', false),
       ('S009', 'IRE',  'Islamic Religious Education',  'religion', false),
       ('S010', 'PE',   'Physical Education',           'special',  false),
       ('S011', 'CA',   'Creative Arts',                'special',  false)
     ) as v(code, short_name, name, category, examinable)
     where c.code = 'UNEB'
    on conflict do nothing
  `);
  // Literacy is a lower-primary (P1–P3) strand; everything else runs P1–P7.
  pgm.sql(`
    insert into subject_stage (subject_id, curriculum_stage_id)
    select s.id, cs.id
      from subject s
      join curriculum_stage cs on cs.curriculum_id = s.curriculum_id and cs.phase = 'PRIMARY'
     where s.phase = 'PRIMARY'
       and (s.short_name <> 'LIT' or cs.cycle = 'LOWER')
    on conflict do nothing
  `);

  // ── PLE grading ───────────────────────────────────────────────────────────
  pgm.addColumns("grading_scheme", {
    // How many examinable subjects make up the aggregate (PLE: 4) — null for
    // schemes that don't aggregate (NLSC).
    aggregate_subject_count: { type: "integer" },
    // [{ label, minAggregate, maxAggregate }] — lower aggregate is better.
    divisions: { type: "jsonb" },
  });

  pgm.sql(`
    insert into grading_scheme
      (curriculum_id, regime, applies_to, role_scope, name, is_active, aggregate_subject_count, divisions)
    select c.id, 'ple_1_9', 'PRIMARY', 'any', 'PLE (Aggregates & Divisions)', true, 4,
           '[{"label":"Division 1","minAggregate":4,"maxAggregate":12},
             {"label":"Division 2","minAggregate":13,"maxAggregate":23},
             {"label":"Division 3","minAggregate":24,"maxAggregate":29},
             {"label":"Division 4","minAggregate":30,"maxAggregate":34},
             {"label":"Ungraded","minAggregate":35,"maxAggregate":36}]'::jsonb
      from curriculum c
     where c.code = 'UNEB'
  `);
  // UNEB doesn't publish PLE percentage cut-offs; these are the ones most
  // Ugandan primary schools use internally. Schools can fork-and-edit them
  // from Grading Schemes like any other non-subsidiary scheme.
  pgm.sql(`
    insert into grade_band (grading_scheme_id, label, min_pct, max_pct, points, comment)
    select gs.id, b.label, b.min_pct, b.max_pct, b.points, b.comment
      from grading_scheme gs
     cross join (values
       ('F9', 0.00,  39.99, 9, 'Fail'),
       ('P8', 40.00, 44.99, 8, 'Pass'),
       ('P7', 45.00, 49.99, 7, 'Pass'),
       ('C6', 50.00, 54.99, 6, 'Credit'),
       ('C5', 55.00, 59.99, 5, 'Credit'),
       ('C4', 60.00, 69.99, 4, 'Good'),
       ('C3', 70.00, 79.99, 3, 'Very Good'),
       ('D2', 80.00, 89.99, 2, 'Distinction'),
       ('D1', 90.00, 100.00, 1, 'Excellent')
     ) as b(label, min_pct, max_pct, points, comment)
     where gs.regime = 'ple_1_9' and gs.school_id is null
  `);
  pgm.sql(`
    insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
    select sc.school_id, 'PRIMARY', 'any', gs.id
      from school_curriculum sc
      join grading_scheme gs on gs.curriculum_id = sc.curriculum_id
                            and gs.regime = 'ple_1_9' and gs.school_id is null
    on conflict do nothing
  `);

  // ── Kindergarten: learning areas + developmental assessment ──────────────
  pgm.createTable("learning_area", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    description: { type: "text" },
    sort_order: { type: "integer", notNull: true, default: 0 },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("learning_area", ["school_id", "name"], { unique: true });

  pgm.createTable("developmental_assessment", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    term_id: { type: "uuid", notNull: true, references: "terms", onDelete: "cascade" },
    learning_area_id: { type: "uuid", notNull: true, references: "learning_area", onDelete: "cascade" },
    rating: { type: "text" },
    teacher_comment: { type: "text" },
    recorded_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("developmental_assessment", "developmental_assessment_rating_check", {
    check: "rating is null or rating in ('emerging', 'developing', 'proficient')",
  });
  pgm.createIndex("developmental_assessment", ["student_user_id", "term_id", "learning_area_id"], {
    unique: true,
  });
  pgm.createIndex("developmental_assessment", ["school_id", "term_id"]);

  // The term's overall narrative — the class teacher's and head teacher's
  // remarks on a kindergarten progress report.
  pgm.createTable("developmental_remark", {
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    term_id: { type: "uuid", notNull: true, references: "terms", onDelete: "cascade" },
    class_teacher_comment: { type: "text" },
    head_teacher_comment: { type: "text" },
    updated_by: { type: "uuid", references: "users", onDelete: "set null" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("developmental_remark", "developmental_remark_pkey", {
    primaryKey: ["student_user_id", "term_id"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("developmental_remark");
  pgm.dropTable("developmental_assessment");
  pgm.dropTable("learning_area");

  pgm.sql(`delete from school_grading_scheme where applies_to = 'PRIMARY'`);
  pgm.sql(`delete from grading_scheme where applies_to = 'PRIMARY'`);
  pgm.dropColumns("grading_scheme", ["aggregate_subject_count", "divisions"]);

  pgm.sql(`
    delete from subject s using curriculum c
     where c.id = s.curriculum_id and c.code = 'UNEB' and s.phase = 'PRIMARY'
  `);
  pgm.sql(`
    delete from curriculum_stage cs using curriculum c
     where c.id = cs.curriculum_id and c.code = 'UNEB' and cs.phase in ('KINDERGARTEN', 'PRIMARY')
  `);
  pgm.sql(`
    update curriculum_stage cs
       set sequence_number = cs.sequence_number - 10
      from curriculum c
     where c.id = cs.curriculum_id and c.code = 'UNEB'
       and cs.phase in ('O_LEVEL', 'A_LEVEL') and cs.sequence_number > 10
  `);
  pgm.dropColumns("curriculum_stage", ["cycle"]);
  pgm.dropColumns("schools", ["offers_kindergarten", "offers_primary"]);
};
