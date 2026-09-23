/* eslint-disable */
exports.shorthands = undefined;

// A school's own name for a class level: "Level 1" instead of "Primary 1",
// "KG 1" instead of "Baby Class". The national stage (P1, BABY, …) stays
// the same underneath — codes, promotion order and PLE/UNEB logic don't
// change; only what the school sees and prints.
//
// Set once per school per stage, so it applies to that class in every
// academic year. stage_label() is the single place the rule lives: the
// school's name if it set one, else the national name.

exports.up = (pgm) => {
  pgm.createTable("school_stage_label", {
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    curriculum_stage_id: { type: "uuid", notNull: true, references: "curriculum_stage", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("school_stage_label", "school_stage_label_pkey", {
    primaryKey: ["school_id", "curriculum_stage_id"],
  });
  pgm.addConstraint("school_stage_label", "school_stage_label_name_check", {
    check: "length(trim(name)) between 1 and 40",
  });
  // Two levels of one school can't share a name — reports would be ambiguous.
  pgm.sql(`create unique index school_stage_label_name_unique on school_stage_label (school_id, lower(trim(name)))`);

  pgm.sql(`
    create function stage_label(p_school_id uuid, p_stage_id uuid) returns text
    language sql stable as $$
      select coalesce(
        (select name from school_stage_label where school_id = p_school_id and curriculum_stage_id = p_stage_id),
        (select name from curriculum_stage where id = p_stage_id)
      )
    $$
  `);
};

exports.down = (pgm) => {
  pgm.sql(`drop function stage_label(uuid, uuid)`);
  pgm.dropTable("school_stage_label");
};
