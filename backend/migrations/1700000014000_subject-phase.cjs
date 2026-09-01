/* eslint-disable */
exports.shorthands = undefined;

// O-Level (S1–S4) and A-Level (S5–S6) subjects are managed separately — they
// have genuinely different models (NLSC bundle of 8–10 vs the principal/
// subsidiary combination). A subject now belongs to exactly one phase; a school
// offering "Mathematics" at both levels has two subject rows (different
// syllabi, different grading). See uganda-secondary-school-foundations.md §3.

exports.up = (pgm) => {
  pgm.addColumns("subject", { phase: { type: "text" } });

  // Backfill: A_LEVEL only if every current stage link is A-Level, else O_LEVEL.
  pgm.sql(`
    update subject s set phase = coalesce(
      (select case when bool_and(cs.phase = 'A_LEVEL') then 'A_LEVEL' else 'O_LEVEL' end
         from subject_stage ss
         join curriculum_stage cs on cs.id = ss.curriculum_stage_id
        where ss.subject_id = s.id),
      'O_LEVEL');
  `);

  // Drop any stage links that don't match the subject's phase (a subject that
  // was checked at both O- and A-Level stages loses the mismatched ones).
  pgm.sql(`
    delete from subject_stage ss
     using curriculum_stage cs, subject s
     where cs.id = ss.curriculum_stage_id
       and s.id = ss.subject_id
       and cs.phase is distinct from s.phase;
  `);

  pgm.alterColumn("subject", "phase", { notNull: true });
  pgm.createIndex("subject", ["curriculum_id", "phase"]);
};

exports.down = (pgm) => {
  pgm.dropIndex("subject", ["curriculum_id", "phase"]);
  pgm.dropColumns("subject", ["phase"]);
};
