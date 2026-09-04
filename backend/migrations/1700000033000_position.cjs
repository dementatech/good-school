/* eslint-disable */
exports.shorthands = undefined;

// docs/design/organization-studio.md §1 — one tree, from Head Teacher down to
// individual staff. Every node (leadership title, Head of Department, a
// generic "X Teacher" slot) is one row here, connected via
// parent_position_id; the org chart is just this tree, rendered — no
// separate chart data structure.
//
// `is_academic_root` is not in the doc's literal schema — it's the concrete
// mechanism for §2's "parented under whichever leadership position the
// school has designated to oversee academics (typically Deputy Head
// Teacher–Academics/DOS)": the admin marks exactly one leadership position
// as that designee, and every auto-generated subject department attaches
// there. Nullable/unset is fine (a school that hasn't set up its leadership
// tier yet) — auto-generated departments simply land at the root until one
// is designated.

exports.up = (pgm) => {
  pgm.createTable("position", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    title: { type: "text", notNull: true },
    category: { type: "text", notNull: true },
    parent_position_id: {
      type: "uuid",
      references: "position",
      onDelete: "set null",
    },
    department_id: {
      type: "uuid",
      references: "department",
      onDelete: "cascade",
    },
    is_unique: { type: "boolean", notNull: true, default: false },
    is_academic_root: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("position", "position_category_check", {
    check: "category in ('executive','department_head','teacher','non_teaching')",
  });
  pgm.createIndex("position", "school_id");
  pgm.createIndex("position", "parent_position_id");
  pgm.createIndex("position", "department_id");

  // At most one designated academics-root position per school.
  pgm.sql(`
    create unique index position_one_academic_root_per_school
      on position (school_id)
      where is_academic_root = true
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("position");
};
