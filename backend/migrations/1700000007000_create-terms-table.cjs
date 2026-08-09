/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // No term-count cap enforced here (the prototype this is adapted from used
  // a hardcoded "max 3 terms" trigger) — the academic-structure module's
  // createTerm() checks school_settings['terms_per_academic_year'] instead,
  // so the limit is per-school data, not a schema constant.
  pgm.createTable("terms", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    school_id: {
      type: "uuid",
      notNull: true,
      references: "schools",
      onDelete: "cascade",
    },
    academic_year_id: {
      type: "uuid",
      notNull: true,
      references: "academic_years",
      onDelete: "cascade",
    },
    name: {
      type: "text",
      notNull: true,
    },
    start_date: {
      type: "date",
      notNull: true,
    },
    end_date: {
      type: "date",
      notNull: true,
    },
    is_current: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    created_by: {
      type: "uuid",
      references: "users",
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

  pgm.addConstraint("terms", "check_term_dates", {
    check: "end_date > start_date",
  });

  pgm.createIndex("terms", ["academic_year_id", "name"], { unique: true });
  pgm.createIndex("terms", "school_id");

  // Only one current term per academic year.
  pgm.createIndex("terms", "academic_year_id", {
    unique: true,
    name: "idx_one_current_term_per_academic_year",
    where: "is_current = true",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("terms");
};
