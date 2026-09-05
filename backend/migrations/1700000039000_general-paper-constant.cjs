/* eslint-disable */
exports.shorthands = undefined;

// General Paper stops being identified by category ('general') — A-Level
// categories are now just science / art / subsidiary, and GP is one specific
// 'subsidiary' subject, not its own category (an ordinary subsidiary-only
// subject like "Sub-ICT" shares the category but isn't GP). GP is instead a
// flagged system constant (`is_general_paper`), seeded once per curriculum —
// never created through the ordinary subject form. See
// subjects.repository.ts's `ensureGeneralPaperSubject`, called from
// curricula.repository.ts whenever a curriculum is created.

exports.up = (pgm) => {
  pgm.addColumn("subject", {
    is_general_paper: { type: "boolean", notNull: true, default: false },
  });

  // At most one GP per curriculum.
  pgm.createIndex("subject", "curriculum_id", {
    unique: true,
    name: "subject_one_general_paper_per_curriculum",
    where: "is_general_paper",
  });

  // Any subject already tagged with the old 'general' category *is* GP —
  // carry that forward onto the new flag before backfilling below, so the
  // loop doesn't create a second one.
  pgm.sql(`update subject set is_general_paper = true, category = 'subsidiary' where category = 'general'`);

  // Every curriculum needs its own GP — seed one for any that doesn't have
  // one yet (existing curricula predate this constant).
  pgm.sql(`
    do $$
    declare
      cur record;
      next_code text;
    begin
      for cur in select id from curriculum loop
        if not exists (select 1 from subject where curriculum_id = cur.id and is_general_paper) then
          select 'S' || lpad((coalesce(max((substring(code from '^S([0-9]+)$'))::int), 0) + 1)::text, 3, '0')
            into next_code
            from subject
            where curriculum_id = cur.id and phase = 'A_LEVEL' and code ~ '^S[0-9]+$';
          insert into subject
            (curriculum_id, phase, code, short_name, name, category, is_examinable, is_active, status, is_general_paper)
          values
            (cur.id, 'A_LEVEL', next_code, 'GP', 'General Paper', 'subsidiary', true, true, 'approved', true);
        end if;
      end loop;
    end $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`delete from subject where is_general_paper`);
  pgm.dropIndex("subject", "curriculum_id", { name: "subject_one_general_paper_per_curriculum" });
  pgm.dropColumn("subject", "is_general_paper");
};
