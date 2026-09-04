/* eslint-disable */
exports.shorthands = undefined;

// docs/design/teachers-module.md §3 — who teaches what, kept as a time-bound
// record rather than a flag: a mid-year substitute closes the old row
// (status='ended', end_date set) and opens a new one, so "who was actually
// teaching S2 East Biology in March" stays answerable.
//
// `class_level_id` in the doc is `class_id` here, matching the column name
// `classes`/`student_enrollment` already use for the same concept.
// `stream_id` is nullable per the doc — a subject taught to a whole class
// level with no stream split — and doubles for A-Level combination-derived
// streams, so no separate combination_id column (subject-selection-module.md
// §3.5, already cited by the doc this migration implements).

exports.up = (pgm) => {
  pgm.createTable("subject_teacher_assignment", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    subject_id: {
      type: "uuid",
      notNull: true,
      references: "subject",
      onDelete: "restrict",
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
    stream_id: {
      type: "uuid",
      references: "streams",
      onDelete: "restrict",
    },
    staff_id: {
      type: "uuid",
      notNull: true,
      references: "staff",
      onDelete: "restrict",
    },
    is_lead: { type: "boolean", notNull: true, default: true },
    status: { type: "text", notNull: true, default: "active" },
    start_date: { type: "date", notNull: true },
    end_date: { type: "date" },
    assigned_by: {
      type: "uuid",
      references: "users",
      onDelete: "set null",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("subject_teacher_assignment", "subject_teacher_assignment_status_check", {
    check: "status in ('active','ended')",
  });

  // "Is anyone assigned here" / "who teaches this" lookups — the shapes the
  // allocation screen and the gaps view both query by.
  pgm.createIndex(
    "subject_teacher_assignment",
    ["school_id", "academic_year_id", "subject_id", "class_id"],
    { name: "subject_teacher_assignment_lookup" },
  );
  pgm.createIndex("subject_teacher_assignment", "staff_id");

  // Only one active lead per subject/class/stream slot — but a plain unique
  // index treats every NULL stream_id as distinct from every other, which
  // would let the whole-class-level case (stream_id null, the common small-
  // school shape per the doc) silently double up. Coalesce it to a sentinel
  // so "no stream" is one group, not one group per row. Co-teaching
  // (is_lead=false) isn't constrained by this, only a duplicate lead.
  pgm.sql(`
    create unique index subject_teacher_assignment_one_active_lead
      on subject_teacher_assignment (
        school_id, subject_id, academic_year_id, class_id,
        coalesce(stream_id, '00000000-0000-0000-0000-000000000000'), staff_id
      )
      where status = 'active' and is_lead = true
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("subject_teacher_assignment");
};
