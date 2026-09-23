/* eslint-disable */
exports.shorthands = undefined;

// Timetables, the daily attendance register, and lesson preparation (schemes
// of work, lesson plans, records of work). Everything that varies by term
// hangs off term_id — Ugandan schools re-timetable and report per term
// (uganda-secondary-school-foundations.md §2).

exports.up = (pgm) => {
  // ── Timetable ─────────────────────────────────────────────────────────────
  // The day's structure, per section — Nursery keeps a shorter day than
  // Primary or Secondary. Breaks/lunch/assembly are rows too, so the grid
  // shows the whole day in order.
  pgm.createTable("timetable_period", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    section: { type: "text", notNull: true },
    label: { type: "text", notNull: true },
    start_time: { type: "time", notNull: true },
    end_time: { type: "time", notNull: true },
    kind: { type: "text", notNull: true, default: "lesson" },
    sort_order: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("timetable_period", "timetable_period_kind_check", {
    check: "kind in ('lesson', 'break', 'lunch', 'assembly', 'other')",
  });
  pgm.addConstraint("timetable_period", "timetable_period_section_check", {
    check: "section in ('KINDERGARTEN', 'PRIMARY', 'SECONDARY')",
  });
  pgm.addConstraint("timetable_period", "timetable_period_times_check", { check: "end_time > start_time" });
  pgm.createIndex("timetable_period", ["school_id", "section", "sort_order"]);

  // Which weekdays the section teaches (1 = Monday … 6 = Saturday).
  pgm.addColumns("school_section", {
    timetable_days: { type: "integer[]", notNull: true, default: "{1,2,3,4,5}" },
  });

  // One lesson in the grid: a subject taught by a teacher — or, for Nursery,
  // a free activity ("Story time", "Games") that isn't a subject.
  pgm.createTable("timetable_slot", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    term_id: { type: "uuid", notNull: true, references: "terms", onDelete: "cascade" },
    class_id: { type: "uuid", notNull: true, references: "classes", onDelete: "cascade" },
    stream_id: { type: "uuid", references: "streams", onDelete: "cascade" },
    day_of_week: { type: "integer", notNull: true },
    period_id: { type: "uuid", notNull: true, references: "timetable_period", onDelete: "cascade" },
    subject_id: { type: "uuid", references: "subject", onDelete: "cascade" },
    activity: { type: "text" },
    staff_id: { type: "uuid", references: "users", onDelete: "set null" },
    room: { type: "text" },
    created_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("timetable_slot", "timetable_slot_day_check", { check: "day_of_week between 1 and 6" });
  pgm.addConstraint("timetable_slot", "timetable_slot_what_check", {
    check: "(subject_id is not null) or (activity is not null and length(trim(activity)) > 0)",
  });
  // A class (or stream) has one lesson per period…
  pgm.sql(`
    create unique index timetable_slot_class_unique on timetable_slot
      (term_id, class_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid), day_of_week, period_id)
  `);
  // …and a teacher is in one place per period.
  pgm.sql(`
    create unique index timetable_slot_teacher_unique on timetable_slot (term_id, staff_id, day_of_week, period_id)
      where staff_id is not null
  `);
  pgm.createIndex("timetable_slot", ["school_id", "term_id"]);

  // ── Daily attendance register ─────────────────────────────────────────────
  pgm.createTable("attendance_record", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    class_id: { type: "uuid", notNull: true, references: "classes", onDelete: "cascade" },
    term_id: { type: "uuid", references: "terms", onDelete: "set null" },
    attendance_date: { type: "date", notNull: true },
    status: { type: "text", notNull: true },
    reason: { type: "text" },
    recorded_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("attendance_record", "attendance_record_status_check", {
    check: "status in ('present', 'absent', 'late', 'excused')",
  });
  pgm.createIndex("attendance_record", ["student_user_id", "attendance_date"], { unique: true });
  pgm.createIndex("attendance_record", ["school_id", "class_id", "attendance_date"]);

  // ── Lesson preparation ────────────────────────────────────────────────────
  // Draft → submitted → approved, or returned with a comment for changes.
  const reviewColumns = {
    status: { type: "text", notNull: true, default: "draft" },
    submitted_at: { type: "timestamptz" },
    reviewed_by: { type: "uuid", references: "users", onDelete: "set null" },
    reviewed_at: { type: "timestamptz" },
    review_comment: { type: "text" },
  };
  const reviewCheck = "status in ('draft', 'submitted', 'approved', 'returned')";

  pgm.createTable("scheme_of_work", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    term_id: { type: "uuid", notNull: true, references: "terms", onDelete: "cascade" },
    class_id: { type: "uuid", notNull: true, references: "classes", onDelete: "cascade" },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "cascade" },
    teacher_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    ...reviewColumns,
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("scheme_of_work", "scheme_of_work_status_check", { check: reviewCheck });
  pgm.createIndex("scheme_of_work", ["term_id", "class_id", "subject_id"], { unique: true });

  // One row per week of the term: the plan, and (filled in as the term runs)
  // the record of work — what was actually covered, checked by the DOS.
  pgm.createTable("scheme_of_work_week", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    scheme_id: { type: "uuid", notNull: true, references: "scheme_of_work", onDelete: "cascade" },
    week_number: { type: "integer", notNull: true },
    topic: { type: "text" },
    sub_topic: { type: "text" },
    competences: { type: "text" },
    methods: { type: "text" },
    materials: { type: "text" },
    references_text: { type: "text" },
    remarks: { type: "text" },
    // Record of work
    work_covered: { type: "text" },
    coverage: { type: "text" },
    coverage_remarks: { type: "text" },
    recorded_at: { type: "timestamptz" },
    checked_by: { type: "uuid", references: "users", onDelete: "set null" },
    checked_at: { type: "timestamptz" },
  });
  pgm.addConstraint("scheme_of_work_week", "scheme_of_work_week_coverage_check", {
    check: "coverage is null or coverage in ('covered', 'partly', 'not_covered')",
  });
  pgm.createIndex("scheme_of_work_week", ["scheme_id", "week_number"], { unique: true });

  pgm.createTable("lesson_plan", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    teacher_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    term_id: { type: "uuid", references: "terms", onDelete: "set null" },
    class_id: { type: "uuid", notNull: true, references: "classes", onDelete: "cascade" },
    stream_id: { type: "uuid", references: "streams", onDelete: "set null" },
    subject_id: { type: "uuid", references: "subject", onDelete: "cascade" },
    timetable_slot_id: { type: "uuid", references: "timetable_slot", onDelete: "set null" },
    scheme_week_id: { type: "uuid", references: "scheme_of_work_week", onDelete: "set null" },
    lesson_date: { type: "date", notNull: true },
    topic: { type: "text", notNull: true },
    sub_topic: { type: "text" },
    objectives: { type: "text" },
    materials: { type: "text" },
    introduction: { type: "text" },
    development: { type: "text" },
    conclusion: { type: "text" },
    assessment: { type: "text" },
    self_evaluation: { type: "text" },
    ...reviewColumns,
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("lesson_plan", "lesson_plan_status_check", { check: reviewCheck });
  pgm.createIndex("lesson_plan", ["school_id", "teacher_id", "lesson_date"]);
  pgm.createIndex("lesson_plan", ["school_id", "status"]);
};

exports.down = (pgm) => {
  pgm.dropTable("lesson_plan");
  pgm.dropTable("scheme_of_work_week");
  pgm.dropTable("scheme_of_work");
  pgm.dropTable("attendance_record");
  pgm.dropTable("timetable_slot");
  pgm.dropColumns("school_section", ["timetable_days"]);
  pgm.dropTable("timetable_period");
};
