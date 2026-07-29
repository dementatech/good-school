/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Profile data, normalized away from `users` (identity/auth only — see
  // claude.md §3). A students row only exists once a user has been enrolled,
  // so user_id doubles as this table's own primary key (1:1, not a separate id).
  pgm.createTable("students", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      references: "users",
      onDelete: "cascade",
    },
    full_name: {
      type: "text",
      notNull: true,
    },
    date_of_birth: {
      type: "date",
    },
    class_name: {
      type: "text",
    },
    enrolled_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("students");
};
