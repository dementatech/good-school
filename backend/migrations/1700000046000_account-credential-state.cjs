/* eslint-disable */
exports.shorthands = undefined;

// Credential-management state for the unified super-admin Accounts page
// (docs/design/accounts-module.md). Until now `users` carried no "this login
// is disabled" or "force a password change" flag — deactivating an account or
// making an admin-issued temp password single-use had nowhere to live. Also
// gives `guardian` a login: one nullable FK to `users` (role 'parent'), so a
// guardian can be issued credentials without the full account/account_link
// unification that doc sketches for later.

exports.up = (pgm) => {
  pgm.addColumns("users", {
    is_active: { type: "boolean", notNull: true, default: true },
    // New rows default false: an account created today keeps working with the
    // password it was given. The admin "Reset password" action flips this to
    // true, and `POST /auth/change-password` clears it again on first login.
    must_change_password: { type: "boolean", notNull: true, default: false },
  });

  pgm.addColumn("guardian", {
    user_id: {
      type: "uuid",
      references: "users",
      onDelete: "set null",
    },
  });

  // One login per guardian; a guardian with no login is the common case.
  pgm.createIndex("guardian", "user_id", {
    unique: true,
    where: "user_id IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("guardian", "user_id", { unique: true, where: "user_id IS NOT NULL" });
  pgm.dropColumn("guardian", "user_id");
  pgm.dropColumns("users", ["is_active", "must_change_password"]);
};
