/* eslint-disable */
exports.shorthands = undefined;

// docs/design/departments-module.md §2 — links an academic department to the
// subject(s) it covers. A join table, not a strict 1:1 column, so a school
// that wants to merge subjects under one department (e.g. a low-enrollment
// subject folded into a related one) can still do that — auto-generated
// one-row-per-department is the default, not the only shape.

exports.up = (pgm) => {
  pgm.createTable("department_subject", {
    department_id: {
      type: "uuid",
      notNull: true,
      references: "department",
      onDelete: "cascade",
    },
    subject_id: {
      type: "uuid",
      notNull: true,
      references: "subject",
      onDelete: "cascade",
    },
  });

  pgm.addConstraint("department_subject", "department_subject_pkey", {
    primaryKey: ["department_id", "subject_id"],
  });
  pgm.createIndex("department_subject", "subject_id");
};

exports.down = (pgm) => {
  pgm.dropTable("department_subject");
};
