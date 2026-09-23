/* eslint-disable */
exports.shorthands = undefined;

// Schools run any combination of levels: Kindergarten only, Primary only,
// Nursery + Primary, Secondary only, or a campus running Nursery through
// A-Level. 1700000064000's either-primary-or-secondary category was too
// strict, so it goes. What stays is the isolation it was for: a school sees
// only the levels it offers (enforced per level in the API), and every school
// offers at least one.

exports.up = (pgm) => {
  pgm.dropConstraint("schools", "schools_category_levels_check");
  pgm.dropColumns("schools", ["school_category"]);
  pgm.addConstraint("schools", "schools_offers_a_level_check", {
    check: "offers_kindergarten or offers_primary or offers_o_level or offers_a_level",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("schools", "schools_offers_a_level_check");
  pgm.addColumns("schools", {
    school_category: { type: "text", notNull: true, default: "secondary" },
  });
  pgm.sql(`
    update schools set school_category = 'primary'
     where (offers_kindergarten or offers_primary) and not offers_o_level and not offers_a_level
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
};
