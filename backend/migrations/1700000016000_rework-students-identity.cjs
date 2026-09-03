/* eslint-disable */
exports.shorthands = undefined;

// Phase 3A — split `students` (currently identity + a free-text `class_name`
// + a single `enrolled_at`) down to identity-only fields. Class/stream and
// enrollment history move to the new `student_enrollment` table (next
// migration); guardians move to `guardian`/`student_guardian` (migration
// after that). See docs/design/student-data-model.md §2.
//
// `full_name` is backfilled into first_name/last_name (best-effort split on
// the first space) rather than dropped blind — existing student rows keep a
// usable name, an admin can correct the split later. `class_name` and
// `enrolled_at` have no safe automatic replacement (mapping free text to a
// real class_id would be guessing — see docs/design/../no magic typing rule)
// so they're just dropped; the new enrollment migration deliberately does
// NOT fabricate a student_enrollment row from them.

exports.up = (pgm) => {
  pgm.addColumns("students", {
    first_name: { type: "text" },
    middle_name: { type: "text" },
    last_name: { type: "text" },
    gender: { type: "text" },
    lin: { type: "text" },
    lin_status: { type: "text", notNull: true, default: "not_yet_issued" },
    nin_guardian_reference: { type: "text" },
  });

  // Best-effort backfill from full_name: first word -> first_name, remainder
  // -> last_name. A single-word name lands entirely in first_name with
  // last_name left as an empty string, not guessed at.
  pgm.sql(`
    update students
       set first_name = split_part(full_name, ' ', 1),
           last_name = case
             when position(' ' in full_name) = 0 then ''
             else trim(substring(full_name from position(' ' in full_name) + 1))
           end
     where first_name is null;
  `);

  pgm.alterColumn("students", "first_name", { notNull: true });
  pgm.alterColumn("students", "last_name", { notNull: true });

  pgm.addConstraint("students", "students_gender_check", {
    check: "gender is null or gender in ('male','female')",
  });
  pgm.addConstraint("students", "students_lin_status_check", {
    check: "lin_status in ('verified','pending','not_yet_issued')",
  });

  pgm.createIndex("students", "lin", { unique: true, where: "lin is not null" });

  pgm.dropColumns("students", ["full_name", "class_name", "enrolled_at"]);
};

exports.down = (pgm) => {
  pgm.addColumns("students", {
    full_name: { type: "text" },
    class_name: { type: "text" },
    enrolled_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.sql(`
    update students
       set full_name = trim(first_name || ' ' || coalesce(nullif(last_name, ''), ''))
     where full_name is null;
  `);
  pgm.alterColumn("students", "full_name", { notNull: true });

  // No explicit dropIndex for `lin` — dropColumns below removes it along
  // with the column (same pattern as school-tenant-model's down()).
  pgm.dropConstraint("students", "students_lin_status_check");
  pgm.dropConstraint("students", "students_gender_check");
  pgm.dropColumns("students", [
    "first_name", "middle_name", "last_name", "gender",
    "lin", "lin_status", "nin_guardian_reference",
  ]);
};
