/* eslint-disable */
exports.shorthands = undefined;

// docs/design/teachers-module.md §1, §2 — teacher/staff identity, mirroring
// the students split (claude.md §3: `users` is identity/auth only). A staff
// row only exists once a user account has been created for them, so
// user_id doubles as this table's own primary key (1:1), same as `students`.
//
// Deliberate departure from the doc's literal `staff (id, ..., phone, email,
// ...)` shape: phone/email already live on `users` for every other role in
// this codebase (see students.repository.ts's SELECT joining u.email,
// u.phone_number) — duplicating them here would just invite the two to drift.
// tmis_number/tmis_status follow the exact nullable/pending pattern already
// used for students' `lin`/`lin_status`, per the doc's own comparison.

exports.up = (pgm) => {
  pgm.createTable("staff", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      references: "users",
      onDelete: "cascade",
    },
    tmis_number: { type: "text" },
    tmis_status: { type: "text", notNull: true, default: "not_registered" },
    first_name: { type: "text", notNull: true },
    middle_name: { type: "text" },
    last_name: { type: "text", notNull: true },
    date_of_birth: { type: "date" },
    gender: { type: "text" },
    qualification: { type: "text" },
    employment_type: { type: "text", notNull: true },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("staff", "staff_gender_check", {
    check: "gender is null or gender in ('male','female')",
  });
  pgm.addConstraint("staff", "staff_tmis_status_check", {
    check: "tmis_status in ('registered','pending','not_registered')",
  });
  pgm.addConstraint("staff", "staff_employment_type_check", {
    check: "employment_type in ('government','private','pta','volunteer')",
  });

  pgm.createIndex("staff", "tmis_number", { unique: true, where: "tmis_number is not null" });
  pgm.createIndex("staff", "is_active");
};

exports.down = (pgm) => {
  pgm.dropTable("staff");
};
