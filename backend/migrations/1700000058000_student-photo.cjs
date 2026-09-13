/* eslint-disable */
exports.shorthands = undefined;

// A student photo, same shape as staff.photo_path/photo_provider (migrations
// 1700000029000, 1700000036000) — `photo_path` is whatever the storage
// backend needs to find the file again (a relative disk path, or a
// Cloudinary public id), `photo_provider` says which. Purely additive; no
// student has a photo yet.

exports.up = (pgm) => {
  pgm.addColumns("students", {
    photo_path: { type: "text" },
    photo_provider: { type: "text" },
  });
  pgm.addConstraint("students", "students_photo_provider_check", {
    check: "photo_provider is null or photo_provider in ('local','cloudinary')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("students", "students_photo_provider_check");
  pgm.dropColumns("students", ["photo_path", "photo_provider"]);
};
