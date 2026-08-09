/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Generic per-school config store. This is what lets business-rule limits
  // (e.g. terms-per-academic-year) live as data a school can adjust, instead
  // of a hardcoded constant in a trigger — see academic-structure module.
  pgm.createTable("school_settings", {
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    key: {
      type: "text",
      notNull: true,
    },
    value: {
      type: "jsonb",
      notNull: true,
    },
    updated_by: {
      type: "uuid",
      references: "users",
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("school_settings", "school_settings_pkey", {
    primaryKey: ["school_id", "key"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("school_settings");
};
