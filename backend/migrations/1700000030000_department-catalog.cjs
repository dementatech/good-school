/* eslint-disable */
exports.shorthands = undefined;

// docs/design/departments-module.md §2-3 — platform-wide catalog of common
// non-academic departments, seeded here the same way subject/curriculum
// catalogs are: super_admin-managed "constants" a school picks from rather
// than typing free text. Academic departments have no catalog row of their
// own — they auto-generate one-per-subject (organization-studio.md §2), so
// `department_catalog` only ever holds `department_type = 'non_academic'`
// rows in practice, though the column stays general per the doc's schema.

exports.up = (pgm) => {
  pgm.createTable("department_catalog", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    department_type: { type: "text", notNull: true },
    // Subjects this catalog entry maps to when adopted (only meaningful for
    // the rare non-academic-catalog-with-a-subject-hint case); nullable and
    // unused by the common toggle-list flow.
    default_subject_ids: { type: "uuid[]" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("department_catalog", "department_catalog_type_check", {
    check: "department_type in ('academic','non_academic')",
  });
  pgm.createIndex("department_catalog", "name", { unique: true });

  pgm.sql(`
    insert into department_catalog (name, department_type) values
      ('Administration', 'non_academic'),
      ('Finance / Bursar''s Office', 'non_academic'),
      ('Library', 'non_academic'),
      ('Boarding / Welfare', 'non_academic'),
      ('Guidance & Counselling', 'non_academic'),
      ('Sports & Games', 'non_academic'),
      ('Health / Sickbay', 'non_academic'),
      ('Security', 'non_academic'),
      ('Catering', 'non_academic'),
      ('Cleaning', 'non_academic')
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("department_catalog");
};
