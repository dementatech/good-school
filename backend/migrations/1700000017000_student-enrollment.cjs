/* eslint-disable */
exports.shorthands = undefined;

// Phase 3A — the enrollment record itself: a school-year-scoped association
// between a student and a class/stream, kept as history (never overwritten).
// See docs/design/student-enrollment.md §1, §4 and
// docs/design/student-data-model.md §3.
//
// No backfill from the old `students.class_name`/`enrolled_at` (dropped in
// the previous migration) — that was free text with no reliable class_id to
// map to. Existing students simply have zero enrollment rows after this
// migration; the frontend surfaces that as "not enrolled — assign a class"
// rather than the system guessing one.

exports.up = (pgm) => {
  pgm.createTable("student_enrollment", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    student_user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
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
    class_id: {
      type: "uuid",
      notNull: true,
      references: "classes",
      onDelete: "restrict",
    },
    // Nullable: a class with has_streams = false has no stream to assign.
    stream_id: {
      type: "uuid",
      references: "streams",
      onDelete: "restrict",
    },
    entry_date: { type: "date", notNull: true },
    entry_type: { type: "text", notNull: true },
    exit_date: { type: "date" },
    exit_type: { type: "text" },
    status: { type: "text", notNull: true, default: "active" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("student_enrollment", "student_enrollment_entry_type_check", {
    check: "entry_type in ('new_admission','transfer','repeat','re_admission_s5')",
  });
  pgm.addConstraint("student_enrollment", "student_enrollment_exit_type_check", {
    check: "exit_type is null or exit_type in ('transfer','withdrawal','completion','no_show')",
  });
  pgm.addConstraint("student_enrollment", "student_enrollment_status_check", {
    check:
      "status in ('applied','admitted','active','transferred_out','withdrawn','graduated','no_show')",
  });

  // At most one active enrollment per student per school at any time.
  pgm.createIndex("student_enrollment", ["student_user_id", "school_id"], {
    unique: true,
    name: "student_enrollment_one_active_per_school",
    where: "status = 'active'",
  });

  // Roster queries: "who's in this class this year".
  pgm.createIndex("student_enrollment", ["school_id", "academic_year_id", "class_id"]);
  pgm.createIndex("student_enrollment", "student_user_id");
};

exports.down = (pgm) => {
  pgm.dropTable("student_enrollment");
};
