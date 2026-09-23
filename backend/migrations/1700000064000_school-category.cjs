/* eslint-disable */
exports.shorthands = undefined;

// A school is EITHER a primary school (Kindergarten and/or Primary) OR a
// secondary school (O-Level and/or A-Level) — chosen once, at registration,
// and never mixed. Each school only ever sees the levels of its own
// category; nothing from the other category is listed, offered or selected
// for it.

exports.up = (pgm) => {
  pgm.addColumns("schools", {
    school_category: { type: "text", notNull: true, default: "secondary" },
  });
  pgm.sql(`
    update schools set school_category = 'primary'
     where (offers_kindergarten or offers_primary) and not offers_o_level and not offers_a_level
  `);
  pgm.sql(`
    do $$
    declare mixed int;
    begin
      select count(*) into mixed from schools
       where (offers_kindergarten or offers_primary) and (offers_o_level or offers_a_level);
      if mixed > 0 then
        raise exception
          'Migration 1700000064000: % school(s) offer both primary and secondary levels. Untick one side for each (a school is either primary or secondary), then re-run.', mixed;
      end if;
    end $$;
  `);
  pgm.addConstraint("schools", "schools_category_levels_check", {
    check: `
      (school_category = 'secondary'
        and not offers_kindergarten and not offers_primary
        and (offers_o_level or offers_a_level))
      or
      (school_category = 'primary'
        and not offers_o_level and not offers_a_level
        and (offers_kindergarten or offers_primary))
    `,
  });

  // Anything already attached to a school for a level it doesn't run —
  // 1700000063000 gave every existing school a PLE selection, secondary ones
  // included.
  pgm.sql(`
    delete from school_grading_scheme sgs using schools s
     where s.id = sgs.school_id
       and ((sgs.applies_to = 'PRIMARY' and not s.offers_primary)
         or (sgs.applies_to = 'O_LEVEL' and not s.offers_o_level)
         or (sgs.applies_to = 'A_LEVEL' and not s.offers_a_level))
  `);
  pgm.sql(`
    delete from subject_offering o using subject sub, schools s
     where sub.id = o.subject_id and s.id = o.school_id
       and ((sub.phase = 'PRIMARY' and not s.offers_primary)
         or (sub.phase = 'O_LEVEL' and not s.offers_o_level)
         or (sub.phase = 'A_LEVEL' and not s.offers_a_level))
  `);
};

exports.down = (pgm) => {
  pgm.dropConstraint("schools", "schools_category_levels_check");
  pgm.dropColumns("schools", ["school_category"]);
};
