/* eslint-disable */
exports.shorthands = undefined;

// A profile photo for the roles with no existing per-role identity table to
// hang one off: parent, school_admin, super_admin (teacher already has
// staff.photo_path — migrations 1700000029000, 1700000036000 — and stays on
// that table since the admin staff directory already reads from it). Same
// shape as staff/students' photo columns. Purely additive.

exports.up = (pgm) => {
  pgm.addColumns("users", {
    photo_path: { type: "text" },
    photo_provider: { type: "text" },
  });
  pgm.addConstraint("users", "users_photo_provider_check", {
    check: "photo_provider is null or photo_provider in ('local','cloudinary')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("users", "users_photo_provider_check");
  pgm.dropColumns("users", ["photo_path", "photo_provider"]);
};
