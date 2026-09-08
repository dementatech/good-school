/* eslint-disable */
exports.shorthands = undefined;

// Prior national-exam performance captured at admission. A student entering
// S1 arrives with PLE results; a student entering S5 arrives with UCE
// results (and is placed into an A-Level combination the same day). Stored
// as a summary — aggregate/points + division/result + year + candidate
// number — not a full transcript. See
// docs/design/uganda-secondary-school-foundations.md §5 (admission accepts a
// prior academic record as first-class input).
//
// `prior_exam_result_subject` is an optional child: the few principal-subject
// UCE grades an admissions officer records so the combination-selection step
// can warn when a principal is picked without a UCE credit behind it
// (docs/design/subject-selection-module.md §4, "prerequisite rules").

exports.up = (pgm) => {
  pgm.createTable("prior_exam_result", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    student_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    // The admission this was captured with — nullable so a result can also be
    // added/backfilled later, independent of any one enrollment period.
    enrollment_id: {
      type: "uuid",
      references: "student_enrollment",
      onDelete: "set null",
    },
    exam_type: { type: "text", notNull: true },
    exam_year: { type: "integer", notNull: true },
    candidate_number: { type: "text" },
    // PLE aggregate (4-36) or UCE points — a single summary number.
    aggregate: { type: "integer" },
    // "Division 1" / "Division 2" ... or NLSC "Result 1" / "Result 2".
    division_or_result: { type: "text" },
    notes: { type: "text" },
    recorded_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("prior_exam_result", "prior_exam_result_exam_type_check", {
    check: "exam_type in ('PLE', 'UCE')",
  });
  pgm.addConstraint("prior_exam_result", "prior_exam_result_exam_year_check", {
    check: "exam_year between 1980 and 2100",
  });
  // One result per student per exam type per year — a correction is an update,
  // not a second row (same spirit as the enrollment/subject models).
  pgm.createIndex("prior_exam_result", ["student_user_id", "exam_type", "exam_year"], {
    unique: true,
    name: "prior_exam_result_student_type_year_unique",
  });
  pgm.createIndex("prior_exam_result", "student_user_id");

  pgm.createTable("prior_exam_result_subject", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    prior_exam_result_id: {
      type: "uuid",
      notNull: true,
      references: "prior_exam_result",
      onDelete: "cascade",
    },
    // The A-Level principal subject this grade vouches for.
    principal_subject_id: { type: "uuid", notNull: true, references: "subject", onDelete: "restrict" },
    grade: { type: "text", notNull: true },
  });
  pgm.createIndex(
    "prior_exam_result_subject",
    ["prior_exam_result_id", "principal_subject_id"],
    { unique: true, name: "prior_exam_result_subject_unique" },
  );

  // The logged reason an admin proceeded with a combination despite an
  // eligibility warning (warn-and-allow, not a hard block).
  pgm.addColumns("student_combination", {
    eligibility_override_reason: { type: "text" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("student_combination", ["eligibility_override_reason"]);
  pgm.dropTable("prior_exam_result_subject");
  pgm.dropTable("prior_exam_result");
};
