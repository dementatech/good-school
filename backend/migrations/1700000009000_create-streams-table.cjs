/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("streams", {
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
    class_id: {
      type: "uuid",
      notNull: true,
      references: "classes",
      onDelete: "cascade",
    },
    name: {
      type: "text",
      notNull: true,
    },
    // Nullable — same reasoning as classes.class_teacher_id.
    stream_teacher_id: {
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

  pgm.createIndex("streams", ["class_id", "name"], { unique: true });
  pgm.createIndex("streams", "school_id");
};

exports.down = (pgm) => {
  pgm.dropTable("streams");
};
