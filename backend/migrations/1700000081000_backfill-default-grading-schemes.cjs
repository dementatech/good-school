/* eslint-disable */
exports.shorthands = undefined;

// Migrations 055/063 gave the default grading schemes only to schools that
// had a curriculum at the time. Schools onboarded later never got an O-Level
// (or A-Level / Primary) scheme, so their report cards printed no grades,
// remarks or overall grade. Attaches the catalog defaults wherever a school
// has none for that level; a school's own choice is never touched. Same SQL
// as attachDefaultGradingSchemes(), which now runs on curriculum attach.

exports.up = (pgm) => {
  pgm.sql(`
    insert into school_grading_scheme (school_id, applies_to, role_scope, grading_scheme_id)
    select distinct on (sc.school_id, gs.applies_to, gs.role_scope)
           sc.school_id, gs.applies_to, gs.role_scope, gs.id
      from school_curriculum sc
      join grading_scheme gs on gs.curriculum_id = sc.curriculum_id and gs.school_id is null
     where gs.name in ('NLSC O-Level', 'NLSC A-Level (Principal)', 'NLSC A-Level (Subsidiary)')
        or (gs.applies_to = 'PRIMARY' and gs.regime = 'ple_1_9')
     order by sc.school_id, gs.applies_to, gs.role_scope, sc.is_primary desc, gs.created_at
    on conflict do nothing
  `);
};

exports.down = () => {};
