/* eslint-disable */
exports.shorthands = undefined;

// `subject.uneb_code` — the UNEB paper code (P425 Mathematics, S850
// Subsidiary ICT, ...) for A-Level catalog subjects. The combination rules
// (src/shared/uneb.ts: exactly 3 principals, which subsidiary goes with
// which principals) key off this code rather than off subject names, which
// vary between curricula and schools. Set by the platform admin; unique per
// curriculum among catalog subjects.
//
// Backfill: tags existing A-Level catalog subjects whose name clearly
// matches a UNEB subject, so current curricula work without re-entering
// anything. Ambiguous names are left null for the platform admin to set.
// Where two subjects in one curriculum match the same code, only the first
// (by code) is tagged.

exports.up = (pgm) => {
  pgm.addColumn("subject", { uneb_code: { type: "text" } });
  pgm.createIndex("subject", ["curriculum_id", "uneb_code"], {
    unique: true,
    where: "uneb_code is not null and school_id is null",
    name: "subject_catalog_uneb_code_unique",
  });

  pgm.sql(`
    update subject set uneb_code = 'S101' where is_general_paper;

    with patterns (uneb_code, is_subsidiary, pattern) as (
      values
        ('S475', true,  '^(sub(sidiary)?[ .-]*)?math'),
        ('S850', true,  '(\\yict\\y|computer|information)'),
        ('P425', false, '^(principal |pure )?math(ematics|s)?$'),
        ('P510', false, '^physics$'),
        ('P525', false, '^chemistry$'),
        ('P530', false, '^biology$'),
        ('P515', false, '^agricultur'),
        ('P220', false, '^economics$'),
        ('P210', false, '^history'),
        ('P250', false, '^geography$'),
        ('P310', false, '^(literature in english|literature)$'),
        ('P230', false, '^entrepreneurship'),
        ('P245', false, '^(divinity|cre|christian religious education)$'),
        ('P235', false, '^(ire|islam|islamic religious education)$'),
        ('P320', false, '^kiswahili$'),
        ('P330', false, '^french$'),
        ('P340', false, '^german$'),
        ('P350', false, '^latin$'),
        ('P370', false, '^arabic$'),
        ('P360', false, '^luganda$'),
        ('P615', false, '^fine art')
    ),
    matches as (
      select s.id, p.uneb_code,
             row_number() over (partition by s.curriculum_id, p.uneb_code order by s.code) as rn,
             count(*) over (partition by s.id) as codes_for_subject
      from subject s
      join patterns p
        on lower(trim(s.name)) ~ p.pattern
       and (s.category = 'subsidiary') = p.is_subsidiary
      where s.phase = 'A_LEVEL' and s.school_id is null
        and not s.is_general_paper and s.uneb_code is null
    )
    update subject s set uneb_code = m.uneb_code
    from matches m
    where m.id = s.id and m.rn = 1 and m.codes_for_subject = 1;
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex("subject", ["curriculum_id", "uneb_code"], { name: "subject_catalog_uneb_code_unique" });
  pgm.dropColumn("subject", "uneb_code");
};
