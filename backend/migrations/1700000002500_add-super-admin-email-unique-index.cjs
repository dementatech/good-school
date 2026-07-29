/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // The (school_id, email) partial unique index doesn't stop duplicate
  // super_admin emails, since every super_admin row has school_id = NULL
  // and NULLs are never equal in a unique index.
  pgm.createIndex("users", "email", {
    unique: true,
    where: "role = 'super_admin' AND email IS NOT NULL",
    name: "users_super_admin_email_unique",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("users", "email", { name: "users_super_admin_email_unique" });
};
