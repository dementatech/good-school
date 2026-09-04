/* eslint-disable */
exports.shorthands = undefined;

// Cloudinary support alongside the existing local-disk store
// (backend/src/shared/uploads.ts). `photo_path` already holds "however we
// identify this stored image" as a bare string; `photo_provider` says how to
// interpret it — a relative path under UPLOADS_DIR when 'local' (or null,
// for rows written before this migration), a Cloudinary public_id when
// 'cloudinary'. Needed for both building the right served URL and, on
// replace/delete, calling the right provider's delete API.

exports.up = (pgm) => {
  pgm.addColumn("staff", {
    photo_provider: { type: "text" },
  });

  pgm.addConstraint("staff", "staff_photo_provider_check", {
    check: "photo_provider is null or photo_provider in ('local','cloudinary')",
  });

  // Every photo already on file was necessarily uploaded through the
  // local-disk path — Cloudinary support starts now.
  pgm.sql(`update staff set photo_provider = 'local' where photo_path is not null`);
};

exports.down = (pgm) => {
  pgm.dropConstraint("staff", "staff_photo_provider_check");
  pgm.dropColumn("staff", "photo_provider");
};
