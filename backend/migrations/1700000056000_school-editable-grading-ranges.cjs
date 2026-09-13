/* eslint-disable */
exports.shorthands = undefined;

// Fork-on-customize: schools want to adjust the actual band ranges/comments
// for O-Level and A-Level Principal ("many want to adjust the ranges —
// e.g. 0-40 = E... schools have different comments"), but the catalog
// (1700000055000) is still worth keeping — a sensible starting point, and
// the only mechanism for A-Level Subsidiary, which must stay a fixed,
// uniform UACE mechanic (0-49.99% = Fail/0pt, 50-100% = Pass/1pt), not
// something that varies per school.
//
// grading_scheme.school_id comes back, but nullable this time: null = a
// shared catalog template (super-admin managed, unchanged), non-null = one
// school's own private, editable copy. "Edit my ranges"
// (grading-schemes.repository.ts editSchoolGradingRanges) forks a catalog
// scheme into a school-owned row the first time a school customizes it —
// the original template, and every other school still pointing at it, is
// never touched. Subsidiary can never be forked — enforced here, not just
// in the UI, so there's no path to a school-specific Subsidiary scheme.
//
// Purely additive — no existing row's meaning changes, nothing to re-seed.

exports.up = (pgm) => {
  pgm.addColumns("grading_scheme", {
    school_id: { type: "uuid", references: "schools", onDelete: "cascade" },
  });
  pgm.addConstraint("grading_scheme", "grading_scheme_subsidiary_not_school_owned", {
    check: "not (role_scope = 'subsidiary' and school_id is not null)",
  });
};

exports.down = (pgm) => {
  pgm.sql(`alter table grading_scheme drop constraint if exists grading_scheme_subsidiary_not_school_owned`);
  pgm.dropColumns("grading_scheme", ["school_id"]);
};
