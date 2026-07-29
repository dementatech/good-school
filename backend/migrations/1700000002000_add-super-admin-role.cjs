/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Platform-level role (Dementa Technologies / SaaS owner) — not scoped to a school.
  // A new enum value can't be used in the same transaction it's added in, so
  // the index that references 'super_admin' lives in the next migration.
  pgm.sql(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`);

  pgm.alterColumn("users", "school_id", { notNull: false });
};

exports.down = (pgm) => {
  pgm.alterColumn("users", "school_id", { notNull: true });
  // Postgres has no DROP VALUE for enums — the 'super_admin' type value is
  // left in place; any rows using it must be removed/reassigned manually.
};
