/* eslint-disable */
exports.shorthands = undefined;

const DEFAULT_THEME = {
  primaryColor: "#990000", // Ruby Red
  accentColor: "#FFCC99", // Sand
  radius: "0.625rem",
  fontFamily: "Poppins, sans-serif",
  logoUrl: null,
};

exports.up = (pgm) => {
  pgm.createTable("schools", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    name: {
      type: "text",
      notNull: true,
    },
    // Shape: { primaryColor, accentColor, radius, fontFamily, logoUrl } — see
    // frontend/lib/theme/resolve-theme.ts for how this gets applied.
    theme_config: {
      type: "jsonb",
      notNull: true,
      default: pgm.func(`'${JSON.stringify(DEFAULT_THEME)}'::jsonb`),
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

  pgm.addConstraint("users", "users_school_id_fkey", {
    foreignKeys: {
      columns: "school_id",
      references: "schools(id)",
      onDelete: "restrict",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint("users", "users_school_id_fkey");
  pgm.dropTable("schools");
};
