/* eslint-disable */
exports.shorthands = undefined;

// The broad HR grouping requested for the Staff page's tabs — administration/
// teaching/non_teaching/support — distinct from `staff_assignment.role`
// (a coarser "job function" already in use for staff_assignment/subject
// allocation) and from `position.category` (org-chart node type). This is
// simply "which of these four groups does this person's record belong to,"
// driving which tab they show up under and which fields the hire form asks
// for. Backfilled to 'teaching' for existing rows — every staff member
// created before this migration was in fact hired through the
// teaching-only form.

exports.up = (pgm) => {
  pgm.addColumn("staff", {
    category: { type: "text", notNull: true, default: "teaching" },
  });

  pgm.addConstraint("staff", "staff_category_check", {
    check: "category in ('administration','teaching','non_teaching','support')",
  });
  pgm.createIndex("staff", "category");
};

exports.down = (pgm) => {
  pgm.dropConstraint("staff", "staff_category_check");
  pgm.dropColumn("staff", "category");
};
