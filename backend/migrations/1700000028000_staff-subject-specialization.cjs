/* eslint-disable */
exports.shorthands = undefined;

// docs/design/teachers-module.md §3 — which subjects a staff member is
// generally qualified to teach (populates the candidate list when
// allocating), distinct from subject_teacher_assignment (which subject
// they're *actually* assigned to teach right now). Lightweight on purpose:
// specialization changes rarely, so no time-bound history here.

exports.up = (pgm) => {
  pgm.createTable("staff_subject_specialization", {
    staff_id: {
      type: "uuid",
      notNull: true,
      references: "staff",
      onDelete: "cascade",
    },
    subject_id: {
      type: "uuid",
      notNull: true,
      references: "subject",
      onDelete: "cascade",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("staff_subject_specialization", "staff_subject_specialization_pkey", {
    primaryKey: ["staff_id", "subject_id"],
  });
  pgm.createIndex("staff_subject_specialization", "subject_id");
};

exports.down = (pgm) => {
  pgm.dropTable("staff_subject_specialization");
};
