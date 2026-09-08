/* eslint-disable */
exports.shorthands = undefined;

// School logo, stored the same way staff photos are (backend/src/shared/media.ts):
// `logo_path` holds "however we identify this stored image" as a bare string,
// `logo_provider` says how to read it — a relative path under UPLOADS_DIR when
// 'local' (or null), a Cloudinary public_id when 'cloudinary'. A school with no
// logo renders an initials tile on the frontend.

exports.up = (pgm) => {
  pgm.addColumns("schools", {
    logo_path: { type: "text" },
    logo_provider: { type: "text" },
  });

  pgm.addConstraint("schools", "schools_logo_provider_check", {
    check: "logo_provider is null or logo_provider in ('local','cloudinary')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("schools", "schools_logo_provider_check");
  pgm.dropColumns("schools", ["logo_path", "logo_provider"]);
};
