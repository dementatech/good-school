/* eslint-disable */
exports.shorthands = undefined;

// Phase 3A — guardian *data* (no login; that stays out of scope, see
// docs/design/accounts-module.md). `guardian` is deliberately not
// school-scoped — the same person can be a guardian at more than one school
// or for children at different schools; `student_guardian` is where school
// context enters, transitively via the student. See
// docs/design/parent-guardian-module.md §1, §7.

exports.up = (pgm) => {
  pgm.createTable("guardian", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    first_name: { type: "text", notNull: true },
    last_name: { type: "text", notNull: true },
    phone: { type: "text" },
    email: { type: "text" },
    nin: { type: "text" },
    relationship_to_student: { type: "text" },
    source: { type: "text", notNull: true, default: "intake" },
    merged_into_guardian_id: {
      type: "uuid",
      references: "guardian",
      onDelete: "set null",
    },
    merged_at: { type: "timestamptz" },
    merged_by: { type: "uuid", references: "users", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("guardian", "guardian_source_check", {
    check: "source in ('bulk_import','intake','self_registered')",
  });

  // The match-or-create lookup key (parent-guardian-module.md §2) — phone is
  // the most reliably-captured field. Not unique: two real people can share
  // a household line, and a superseded/merged row keeps its old phone.
  pgm.createIndex("guardian", "phone");

  pgm.createTable("student_guardian", {
    student_user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    guardian_id: {
      type: "uuid",
      notNull: true,
      references: "guardian",
      onDelete: "cascade",
    },
    role: { type: "text", notNull: true },
    is_primary_contact: { type: "boolean", notNull: true, default: false },
    is_fee_responsible: { type: "boolean", notNull: true, default: false },
    is_emergency_contact: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("student_guardian", "student_guardian_pkey", {
    primaryKey: ["student_user_id", "guardian_id"],
  });
  pgm.addConstraint("student_guardian", "student_guardian_role_check", {
    check: "role in ('parent','sponsor','guardian')",
  });
  pgm.createIndex("student_guardian", "guardian_id");
};

exports.down = (pgm) => {
  pgm.dropTable("student_guardian");
  pgm.dropTable("guardian");
};
