/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // A school's own academic ladder — S1-S6, Cambridge Year 7-A2, kindergarten
  // "Baby Class"-"Top Class", whatever. Adding a level is an insert, never a
  // migration; nothing downstream assumes a fixed set of levels.
  pgm.createTable("academic_levels", {
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
    code: {
      type: "text",
      notNull: true,
    },
    name: {
      type: "text",
      notNull: true,
    },
    sort_order: {
      type: "integer",
      notNull: true,
      default: 0,
    },
    // Free-text, unconstrained organizational tag (e.g. "kindergarten",
    // "secondary", "cambridge-alevel") for grouping levels in the UI once a
    // school spans multiple phases. Not an enum on purpose.
    stage: {
      type: "text",
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

  pgm.createIndex("academic_levels", ["school_id", "code"], { unique: true });
  pgm.createIndex("academic_levels", "school_id");
};

exports.down = (pgm) => {
  pgm.dropTable("academic_levels");
};
