/* eslint-disable */
exports.shorthands = undefined;

// docs/design/teachers-module.md §2 — a staff member's time-bound
// relationship to one school, exactly the same discipline already applied to
// students (student_enrollment): identity (`staff`) and "where/when do they
// work" are different things, because staff transfer, leave, or (unlike
// students) can hold more than one active assignment at once — teaching at
// two schools is normal here, not an edge case. So unlike
// student_enrollment_one_active_per_school, the "one active" constraint below
// is scoped per (staff, school) — a second active row at a school they're
// already active at is rejected, but a second school entirely is fine.

exports.up = (pgm) => {
  pgm.createTable("staff_assignment", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    staff_id: {
      type: "uuid",
      notNull: true,
      references: "staff",
      onDelete: "cascade",
    },
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "restrict",
    },
    role: { type: "text", notNull: true },
    entry_date: { type: "date", notNull: true },
    entry_type: { type: "text", notNull: true },
    exit_date: { type: "date" },
    exit_type: { type: "text" },
    status: { type: "text", notNull: true, default: "active" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("staff_assignment", "staff_assignment_role_check", {
    check: "role in ('teacher','head_teacher','deputy','bursar','admin','support')",
  });
  pgm.addConstraint("staff_assignment", "staff_assignment_entry_type_check", {
    check: "entry_type in ('new_hire','transfer','government_posting')",
  });
  pgm.addConstraint("staff_assignment", "staff_assignment_exit_type_check", {
    check:
      "exit_type is null or exit_type in ('transfer','resignation','retirement','government_reposting')",
  });
  pgm.addConstraint("staff_assignment", "staff_assignment_status_check", {
    check: "status in ('active','transferred_out','left','retired')",
  });

  pgm.createIndex("staff_assignment", ["staff_id", "school_id"], {
    unique: true,
    name: "staff_assignment_one_active_per_school",
    where: "status = 'active'",
  });
  pgm.createIndex("staff_assignment", ["school_id", "academic_year_id"]);
  pgm.createIndex("staff_assignment", "staff_id");
};

exports.down = (pgm) => {
  pgm.dropTable("staff_assignment");
};
