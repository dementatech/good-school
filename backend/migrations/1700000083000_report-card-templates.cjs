/* eslint-disable */
exports.shorthands = undefined;

// Report card templates. A template is a whole look: which parts show, the
// results table's column order, colours, frame, font, spacing, wording, and,
// for a page-editor ("canvas") template, where each block sits on the page.
//
// The built-in templates (Classic, Modern, Compact, Formal, ...) live in code
// (report-card-templates.repository.ts) and are never stored. A school's own
// templates are stored here, one section each. school_section.report_card_template
// names the section's default: a built-in key ("builtin:classic") or one of
// the school's template ids. Null means Classic.
//
// A school that had already switched parts of its report card on or off
// (school_section.report_card_fields) gets those choices as its own "Our
// layout" template, set as the default, so its cards print exactly as before.

exports.up = (pgm) => {
  pgm.createTable("report_card_template", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    school_id: { type: "uuid", notNull: true, references: "schools", onDelete: "cascade" },
    section: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    kind: { type: "text", notNull: true },
    design: { type: "jsonb", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("report_card_template", "report_card_template_section_check", {
    check: "section in ('KINDERGARTEN', 'PRIMARY', 'SECONDARY')",
  });
  pgm.addConstraint("report_card_template", "report_card_template_kind_check", {
    check: "kind in ('styled', 'canvas')",
  });
  pgm.createIndex("report_card_template", ["school_id", "section"]);
  pgm.sql(`
    create unique index report_card_template_name_unique
      on report_card_template (school_id, section, lower(name))
  `);

  pgm.addColumns("school_section", {
    report_card_template: { type: "text" },
  });

  pgm.sql(`
    with legacy as (
      insert into report_card_template (school_id, section, name, kind, design)
      select school_id, section, 'Our layout', 'styled',
             jsonb_build_object('base', 'classic', 'fields', report_card_fields)
        from school_section
       where report_card_fields is not null and report_card_fields <> '{}'::jsonb
      returning id, school_id, section
    )
    update school_section ss set report_card_template = legacy.id::text
      from legacy
     where ss.school_id = legacy.school_id and ss.section = legacy.section
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns("school_section", ["report_card_template"]);
  pgm.dropTable("report_card_template");
};
