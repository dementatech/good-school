/* eslint-disable */
exports.shorthands = undefined;

// Exams roadmap Step 3 (first slice) — publish results. Everything else in
// Step 3 (best-8 aggregate, Division/Result status, UACE points, class/
// stream ranking, eligibility checks, PDF report cards) reads a frozen,
// provenanced grade — this is that freeze mechanism, deferred out of the
// grading-schemes migration (1700000053000) on purpose:
//
//   exam_result.computed_grade / grading_scheme_id — populated ONLY by the
//     publish action (school-exams.repository.ts publishSchoolExam), never
//     on a raw saveMarks call. Editing marks pre-publish never touches
//     grading; a published grade doesn't drift if the school edits its
//     grading_scheme afterward — republishing is an explicit action.
//   school_exam.published_at — the freeze marker. Once set, further mark
//     edits are blocked (ExamPublishedError, exam-results.repository.ts)
//     until a school admin unpublishes, same "reopen to unlock" shape as
//     exam_subject_submission's per-slot lock, but at the whole-exam level.
//
// Purely additive, both nullable — no exam has ever been published, so
// nothing to backfill.

exports.up = (pgm) => {
  pgm.addColumns("exam_result", {
    computed_grade: { type: "text" },
    // restrict: a grading_scheme that's already been published against
    // can't be deleted out from under the grades that reference it.
    grading_scheme_id: { type: "uuid", references: "grading_scheme", onDelete: "restrict" },
  });

  pgm.addColumns("school_exam", {
    published_at: { type: "timestamptz" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("school_exam", ["published_at"]);
  pgm.dropColumns("exam_result", ["computed_grade", "grading_scheme_id"]);
};
