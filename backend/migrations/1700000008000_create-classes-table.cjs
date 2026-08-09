/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("classes", {
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
    academic_level_id: {
      type: "uuid",
      notNull: true,
      references: "academic_levels",
      onDelete: "restrict",
    },
    has_streams: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    // Nullable: the teachers module has no data yet, so requiring a teacher
    // here would block class creation entirely. Tighten once teacher
    // onboarding exists.
    class_teacher_id: {
      type: "uuid",
      references: "users",
      onDelete: "set null",
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

  pgm.createIndex("classes", ["academic_year_id", "academic_level_id"], { unique: true });
  pgm.createIndex("classes", "school_id");
  pgm.createIndex("classes", "academic_level_id");
};

exports.down = (pgm) => {
  pgm.dropTable("classes");
};
