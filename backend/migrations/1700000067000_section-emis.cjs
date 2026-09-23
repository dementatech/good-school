/* eslint-disable */
exports.shorthands = undefined;

// EMIS registers each section of a school as its own institution — "Metro
// Junior School" is two EMIS entities, its Nursery and its Primary. So the
// EMIS number moves off `schools` onto a per-section row. Still unique across
// the platform: one EMIS number is one institution.
//
// Rows exist only for sections that have something recorded; a section with
// no row simply has no EMIS number yet.

exports.up = (pgm) => {
  pgm.createTable("school_section", {
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    section: { type: "text", notNull: true },
    emis_code: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("school_section", "school_section_pkey", { primaryKey: ["school_id", "section"] });
  pgm.addConstraint("school_section", "school_section_section_check", {
    check: "section in ('KINDERGARTEN', 'PRIMARY', 'SECONDARY')",
  });
  pgm.createIndex("school_section", "emis_code", {
    unique: true,
    name: "school_section_emis_code_unique",
    where: "emis_code is not null",
  });

  // A school's existing EMIS number goes to its section — for a Nursery +
  // Primary school, to Primary (the section a school-level EMIS number most
  // likely referred to).
  pgm.sql(`
    insert into school_section (school_id, section, emis_code)
    select id,
           case when offers_o_level or offers_a_level then 'SECONDARY'
                when offers_primary then 'PRIMARY'
                else 'KINDERGARTEN' end,
           emis_code
      from schools
     where emis_code is not null
  `);
  pgm.dropColumns("schools", ["emis_code"]);
};

exports.down = (pgm) => {
  pgm.addColumns("schools", { emis_code: { type: "text" } });
  pgm.sql(`
    update schools s set emis_code = (
      select ss.emis_code from school_section ss
       where ss.school_id = s.id and ss.emis_code is not null
       order by case ss.section when 'SECONDARY' then 0 when 'PRIMARY' then 1 else 2 end
       limit 1)
  `);
  pgm.createIndex("schools", "emis_code", {
    unique: true,
    name: "schools_emis_code_unique_index",
    where: "emis_code is not null",
  });
  pgm.dropTable("school_section");
};
