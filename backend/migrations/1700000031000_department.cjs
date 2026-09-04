/* eslint-disable */
exports.shorthands = undefined;

// docs/design/departments-module.md §2 — a school's actual departments.
// `catalog_id` is provenance only (adopted-from-catalog vs. custom), never a
// live join — same pattern already established for school_combination's
// `catalog_combination_id` (subject-selection-module.md §3.2b).

exports.up = (pgm) => {
  pgm.createTable("department", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    catalog_id: {
      type: "uuid",
      references: "department_catalog",
      onDelete: "set null",
    },
    name: { type: "text", notNull: true },
    department_type: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("department", "department_type_check", {
    check: "department_type in ('academic','non_academic')",
  });
  pgm.createIndex("department", ["school_id", "name"], { unique: true });
};

exports.down = (pgm) => {
  pgm.dropTable("department");
};
