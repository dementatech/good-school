/* eslint-disable */
exports.shorthands = undefined;

// A school runs sections, not a free mix of levels: Nursery, Primary, or
// Secondary (O/A-Level). Nursery and Primary may share one school (e.g. a
// "Junior School" with both — the admin switches between them in the portal),
// but Secondary always stands alone. There is no Primary + O-Level school.

exports.up = (pgm) => {
  pgm.sql(`
    do $$
    declare mixed int;
    begin
      select count(*) into mixed from schools
       where (offers_kindergarten or offers_primary) and (offers_o_level or offers_a_level);
      if mixed > 0 then
        raise exception
          'Migration 1700000066000: % school(s) combine Nursery/Primary with Secondary. Untick one side for each, then re-run.', mixed;
      end if;
    end $$;
  `);
  pgm.addConstraint("schools", "schools_secondary_stands_alone_check", {
    check: "not ((offers_kindergarten or offers_primary) and (offers_o_level or offers_a_level))",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("schools", "schools_secondary_stands_alone_check");
};
