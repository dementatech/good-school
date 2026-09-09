/* eslint-disable */
exports.shorthands = undefined;

// Payment reconciliation — the per-school, per-provider code that a school
// assigns each learner on its own SchoolPay portal, used to match incoming
// fee payments back to a student. See docs/design/student-data-model.md §6
// and docs/design/student-enrollment.md §3.
//
// Deliberately NOT a flat column on `students`: the code is per-school and
// can legitimately change on transfer or a provider switch, so it lives in
// its own scoped mapping table (same shape as `payment_provider_credential`).
// `student_user_id` references `users` to match the rest of the students
// module (`student_enrollment`, `prior_exam_result`, `student_guardian`).
//
// The admission flow now treats this as a required field for a new student;
// bulk import of pre-existing students leaves it optional and flags the gap.

exports.up = (pgm) => {
  pgm.createTable("student_payment_code", {
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
    provider: { type: "text", notNull: true, default: "schoolpay" },
    external_payment_code: { type: "text", notNull: true },
    is_active: { type: "boolean", notNull: true, default: true },
    linked_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    linked_by: { type: "uuid", references: "users", onDelete: "set null" },
  });

  pgm.addConstraint("student_payment_code", "student_payment_code_provider_check", {
    check: "provider in ('schoolpay')",
  });

  // Reconciliation lookup key (schoolpay-integration.md §3): resolve an
  // incoming payment via the pair (school_id, external_payment_code). Unique
  // only among active rows — a superseded code keeps its row so historical
  // payments made under it still resolve.
  pgm.createIndex(
    "student_payment_code",
    ["school_id", "provider", "external_payment_code"],
    {
      unique: true,
      name: "student_payment_code_active_code_unique",
      where: "is_active",
    },
  );

  // At most one active code per student per school per provider.
  pgm.createIndex(
    "student_payment_code",
    ["student_user_id", "school_id", "provider"],
    {
      unique: true,
      name: "student_payment_code_one_active_per_student",
      where: "is_active",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("student_payment_code");
};
