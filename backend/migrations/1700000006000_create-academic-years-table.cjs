/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("academic_years", {
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
    year_name: {
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

  pgm.addConstraint("academic_years", "check_academic_year_dates", {
    check: "end_date > start_date",
  });

  pgm.createIndex("academic_years", ["school_id", "year_name"], { unique: true });
  pgm.createIndex("academic_years", "school_id");

  // Only one current academic year PER SCHOOL (not globally — the prototype
  // this is adapted from was single-tenant and enforced this across the
  // whole database).
  pgm.createIndex("academic_years", "school_id", {
    unique: true,
    name: "idx_one_current_academic_year_per_school",
    where: "is_current = true",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("academic_years");
};
