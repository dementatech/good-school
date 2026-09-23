/* eslint-disable */
exports.shorthands = undefined;

// Nursery marks, school-owned subjects and per-subject full marks.
//
// - Many Ugandan nursery schools give marks, grades and even positions,
//   though there's no national nursery exam. So a school picks its Nursery
//   assessment style — progress ratings (the default), marks, or both — and
//   whether report cards show positions, per section (school_section).
// - Nursery subjects vary from school to school, so they belong to the school
//   (subject.school_id) and need no approval. A Primary/Secondary school can
//   add its own non-examinable extras (Computer, French, ...) the same way.
//   A school-owned subject is private: no other school ever sees it.
// - Some subjects are marked out of 50, some out of 100, depending on the
//   school: subject_offering.max_mark. Every saved mark keeps the full mark it
//   was entered against (exam_result.max_mark), so changing a full mark later
//   never distorts old results. Grading and averages use the percentage.
// - Nursery grading templates join the catalog; a school picks one and edits
//   its bands freely, like any other level.

exports.up = (pgm) => {
  pgm.addColumns("school_section", {
    // KINDERGARTEN only: 'ratings' | 'marks' | 'both'. Null = 'ratings'.
    assessment_style: { type: "text" },
    // Null = the section default (Nursery off, Primary/Secondary on).
    show_positions: { type: "boolean" },
  });
  pgm.addConstraint("school_section", "school_section_assessment_style_check", {
    check: "assessment_style is null or assessment_style in ('ratings', 'marks', 'both')",
  });

  // ── School-owned subjects ─────────────────────────────────────────────────
  pgm.addColumns("subject", {
    school_id: { type: "uuid", references: "schools", onDelete: "cascade" },
  });
  pgm.dropIndex("subject", ["curriculum_id", "phase", "code"], {
    name: "subject_curriculum_id_phase_code_unique_index",
  });
  pgm.dropIndex("subject", ["curriculum_id", "phase", "short_name"], {
    name: "subject_curriculum_id_phase_short_name_unique_index",
  });
  // Platform catalog: unique per curriculum + level, as before.
  pgm.createIndex("subject", ["curriculum_id", "phase", "code"], {
    unique: true,
    name: "subject_catalog_code_unique",
    where: "school_id is null",
  });
  pgm.createIndex("subject", ["curriculum_id", "phase", "short_name"], {
    unique: true,
    name: "subject_catalog_short_name_unique",
    where: "school_id is null",
  });
  // A school's own subjects: unique within that school + level only.
  pgm.createIndex("subject", ["school_id", "phase", "code"], {
    unique: true,
    name: "subject_school_code_unique",
    where: "school_id is not null",
  });
  pgm.createIndex("subject", ["school_id", "phase", "short_name"], {
    unique: true,
    name: "subject_school_short_name_unique",
    where: "school_id is not null",
  });

  // ── Full marks ───────────────────────────────────────────────────────────
  pgm.addColumns("subject_offering", {
    max_mark: { type: "integer", notNull: true, default: 100 },
  });
  pgm.addConstraint("subject_offering", "subject_offering_max_mark_check", {
    check: "max_mark between 1 and 999",
  });
  pgm.addColumns("exam_result", {
    max_mark: { type: "integer", notNull: true, default: 100 },
  });
  pgm.dropConstraint("exam_result", "exam_result_score_check");
  pgm.addConstraint("exam_result", "exam_result_score_check", {
    check: `(is_absent and raw_score is null)
         or (not is_absent and raw_score is not null and raw_score >= 0 and raw_score <= max_mark)`,
  });

  // ── Nursery grading templates ────────────────────────────────────────────
  const templates = [
    {
      regime: "nursery_letters",
      name: "Nursery — Letter grades (A–E)",
      bands: [
        ["E", 0, 39.99, "Needs more support"],
        ["D", 40, 54.99, "Fair"],
        ["C", 55, 69.99, "Good"],
        ["B", 70, 84.99, "Very good"],
        ["A", 85, 100, "Excellent"],
      ],
    },
    {
      regime: "nursery_words",
      name: "Nursery — Descriptive (Excellent … Try again)",
      bands: [
        ["Try again", 0, 39.99, "Keep trying — needs more support"],
        ["Fair", 40, 54.99, "Fair progress"],
        ["Good", 55, 69.99, "Good work"],
        ["Very Good", 70, 84.99, "Very good work"],
        ["Excellent", 85, 100, "Excellent work"],
      ],
    },
    {
      regime: "nursery_1_9",
      name: "Nursery — D1–F9 style",
      bands: [
        ["F9", 0, 39.99, "Fail"],
        ["P8", 40, 44.99, "Pass"],
        ["P7", 45, 49.99, "Pass"],
        ["C6", 50, 54.99, "Credit"],
        ["C5", 55, 59.99, "Credit"],
        ["C4", 60, 69.99, "Good"],
        ["C3", 70, 79.99, "Very Good"],
        ["D2", 80, 89.99, "Distinction"],
        ["D1", 90, 100, "Excellent"],
      ],
    },
  ];
  for (const t of templates) {
    pgm.sql(`
      insert into grading_scheme (curriculum_id, regime, applies_to, role_scope, name, is_active)
      select id, '${t.regime}', 'KINDERGARTEN', 'any', '${t.name}', true from curriculum where code = 'UNEB'
    `);
    const values = t.bands
      .map(([label, min, max, comment]) => `('${label}', ${min}, ${max}, '${comment.replace(/'/g, "''")}')`)
      .join(",\n        ");
    pgm.sql(`
      insert into grade_band (grading_scheme_id, label, min_pct, max_pct, comment)
      select gs.id, b.label, b.min_pct, b.max_pct, b.comment
        from grading_scheme gs
       cross join (values
        ${values}
       ) as b(label, min_pct, max_pct, comment)
       where gs.regime = '${t.regime}' and gs.school_id is null
    `);
  }
};

exports.down = (pgm) => {
  pgm.sql(`delete from school_grading_scheme where applies_to = 'KINDERGARTEN'`);
  pgm.sql(`delete from grading_scheme where applies_to = 'KINDERGARTEN'`);

  pgm.dropConstraint("exam_result", "exam_result_score_check");
  pgm.addConstraint("exam_result", "exam_result_score_check", {
    check: `(is_absent and raw_score is null)
         or (not is_absent and raw_score is not null and raw_score >= 0 and raw_score <= 100)`,
  });
  pgm.dropColumns("exam_result", ["max_mark"]);
  pgm.dropConstraint("subject_offering", "subject_offering_max_mark_check");
  pgm.dropColumns("subject_offering", ["max_mark"]);

  pgm.sql(`delete from subject where school_id is not null`);
  pgm.dropIndex("subject", [], { name: "subject_school_short_name_unique" });
  pgm.dropIndex("subject", [], { name: "subject_school_code_unique" });
  pgm.dropIndex("subject", [], { name: "subject_catalog_short_name_unique" });
  pgm.dropIndex("subject", [], { name: "subject_catalog_code_unique" });
  pgm.createIndex("subject", ["curriculum_id", "phase", "short_name"], {
    unique: true,
    name: "subject_curriculum_id_phase_short_name_unique_index",
  });
  pgm.createIndex("subject", ["curriculum_id", "phase", "code"], {
    unique: true,
    name: "subject_curriculum_id_phase_code_unique_index",
  });
  pgm.dropColumns("subject", ["school_id"]);

  pgm.dropConstraint("school_section", "school_section_assessment_style_check");
  pgm.dropColumns("school_section", ["assessment_style", "show_positions"]);
};
