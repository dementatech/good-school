/* eslint-disable */
exports.shorthands = undefined;

// Some subjects are examined as separate papers with different weights, then
// merged into one subject mark (e.g. Physics Theory 70% + Practical 30%).
// Missing from the original subject model — added here.
//
//   subject.has_variant  — flag, default false (every existing subject).
//   subject_variant      — the paper split, curriculum-wide (same for every
//                          school teaching the subject, like the rest of the
//                          subject catalog). Contributions must sum to 100%,
//                          enforced in subjects.repository.ts (a cross-row
//                          sum isn't expressible as a plain check constraint).
//   exam_result.subject_variant_id — null for a non-variant subject (exactly
//                          today's meaning, unchanged); one row per
//                          (student, variant) for a variant subject. The
//                          merged subject score is computed on read, never
//                          stored.
//
// Purely additive: no subject has variants yet, so no existing exam_result
// row needs to change meaning or get rewritten.
//
// Editing rule (enforced in subjects.repository.ts, not here): once a subject
// has any exam_result row, `has_variant` and its variants are read-only —
// same precedent as `phase`/`code` being fixed at creation. A real syllabus
// change is a new subject, not a retrofit that would reinterpret marks
// already on file.

exports.up = (pgm) => {
  pgm.addColumns("subject", {
    has_variant: { type: "boolean", notNull: true, default: false },
  });

  pgm.createTable("subject_variant", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    code: { type: "text", notNull: true },
    contribution_percent: { type: "numeric(5,2)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("subject_variant", "subject_variant_contribution_check", {
    check: "contribution_percent > 0 and contribution_percent <= 100",
  });
  pgm.createIndex("subject_variant", ["subject_id", "code"], { unique: true });

  // restrict: a variant that already has marks recorded against it can't be
  // deleted out from under them — the app-level lock above should always
  // catch this first, this is the backstop.
  pgm.addColumns("exam_result", {
    subject_variant_id: { type: "uuid", references: "subject_variant", onDelete: "restrict" },
  });

  // Replace the plain (school_exam, student, subject) uniqueness with one
  // that also distinguishes variants — same nullable-column-as-a-group
  // pattern as subject_teacher_assignment_one_active_lead and
  // exam_subject_submission_slot_unique.
  pgm.sql(`drop index if exists exam_result_exam_student_subject_unique`);
  pgm.sql(`
    create unique index exam_result_exam_student_subject_variant_unique
      on exam_result (
        school_exam_id, student_user_id, subject_id,
        coalesce(subject_variant_id, '00000000-0000-0000-0000-000000000000')
      )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`drop index if exists exam_result_exam_student_subject_variant_unique`);
  pgm.sql(`
    create unique index exam_result_exam_student_subject_unique
      on exam_result (school_exam_id, student_user_id, subject_id)
  `);
  pgm.dropColumns("exam_result", ["subject_variant_id"]);
  pgm.dropTable("subject_variant");
  pgm.dropColumns("subject", ["has_variant"]);
};
