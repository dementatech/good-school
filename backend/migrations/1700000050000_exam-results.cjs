/* eslint-disable */
exports.shorthands = undefined;

// Exams roadmap Step 1 — marks entry. Teachers record a raw score (or "absent")
// per student per subject, against a school_exam.
//
//   exam_result             — one row per (school_exam, student, subject). A
//                             missing row means "not marked yet". raw_score is
//                             a 0–100 percentage; it is null exactly when
//                             is_absent. Grade bands are NOT here — that's
//                             roadmap Step 2, computed from raw_score at
//                             publish time, kept pluggable per curriculum.
//   exam_subject_submission — the lock. A teacher fills a (subject, class,
//                             stream) mark sheet, submits it, and further edits
//                             are frozen until a school admin reopens it
//                             (reopen = delete the row). The slot mirrors
//                             subject_teacher_assignment's granularity — the
//                             same maths teacher owns S1 East and S1 West as
//                             separate sheets.

exports.up = (pgm) => {
  pgm.createTable("exam_result", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_exam_id: { type: "uuid", notNull: true, references: "school_exam", onDelete: "cascade" },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    // restrict: a subject with recorded marks can't be deleted out from under them.
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "restrict" },
    // 0–100 percentage. numeric(5,2) fits 100.00. Null exactly when is_absent.
    raw_score: { type: "numeric(5,2)" },
    is_absent: { type: "boolean", notNull: true, default: false },
    entered_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // A stored row is always meaningful: either "sat out" (absent, no score) or a
  // real 0–100 mark. "Not marked yet" is the absence of a row, never a row with
  // both fields empty.
  pgm.addConstraint("exam_result", "exam_result_score_check", {
    check:
      "(is_absent and raw_score is null) or " +
      "(not is_absent and raw_score is not null and raw_score >= 0 and raw_score <= 100)",
  });

  pgm.createIndex("exam_result", ["school_exam_id", "student_user_id", "subject_id"], {
    unique: true,
    name: "exam_result_exam_student_subject_unique",
  });
  pgm.createIndex("exam_result", ["school_exam_id", "subject_id"]);

  pgm.createTable("exam_subject_submission", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_exam_id: { type: "uuid", notNull: true, references: "school_exam", onDelete: "cascade" },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "restrict" },
    class_id: { type: "uuid", notNull: true, references: "classes", onDelete: "restrict" },
    stream_id: { type: "uuid", references: "streams", onDelete: "restrict" },
    submitted_by: { type: "uuid", references: "users", onDelete: "set null" },
    submitted_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // One lock per mark-sheet slot. NULL stream_id coalesced to a sentinel so the
  // whole-class case (no stream split) is a single group, not one per row —
  // same pattern as subject_teacher_assignment_one_active_lead.
  pgm.sql(`
    create unique index exam_subject_submission_slot_unique
      on exam_subject_submission (
        school_exam_id, subject_id, class_id,
        coalesce(stream_id, '00000000-0000-0000-0000-000000000000')
      )
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("exam_subject_submission");
  pgm.dropTable("exam_result");
};
