/* eslint-disable */
exports.shorthands = undefined;

// Self-service "forgot password" — a request writes a row here with the
// sha256 of a single-use token; the raw token only ever travels in the email
// link. Consuming it sets the new password and stamps `used_at`. Rows are
// disposable: a nightly cleanup (or the next request from the same user)
// clears the stale ones.

exports.up = (pgm) => {
  pgm.createTable("password_reset_tokens", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    token_hash: { type: "text", notNull: true },
    expires_at: { type: "timestamptz", notNull: true },
    used_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // Lookup is always by the hash of the token in the link.
  pgm.createIndex("password_reset_tokens", "token_hash", { unique: true });
  // "invalidate every outstanding token for this user" on a new request / a
  // successful reset.
  pgm.createIndex("password_reset_tokens", "user_id");
};

exports.down = (pgm) => {
  pgm.dropTable("password_reset_tokens");
};
