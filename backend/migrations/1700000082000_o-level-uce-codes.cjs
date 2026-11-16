/* eslint-disable */
exports.shorthands = undefined;

// O-Level catalog subjects get their UCE paper code (112 English, 553
// Biology, ...) in `subject.uneb_code`, so report cards can print a Code
// column. Same approach as 079 for A-Level: only names that clearly match are
// tagged, a code goes to at most one subject per curriculum, and anything
// ambiguous stays null for the platform admin to set on the Curriculum page.
// Never overwrites a code that's already set. (First shipped with Art as
// 610; UNEB's timetable has 612 — corrected here, and 084 fixes databases
// that ran the old version.)

exports.up = (pgm) => {
  pgm.sql(`
    with patterns (uneb_code, pattern) as (
      values
        ('112', '^english'),
        ('208', '^literature'),
        ('223', '^(cre|christian religious education)$'),
        ('225', '^(ire|islamic religious education)$'),
        ('241', '^history'),
        ('273', '^geography$'),
        ('309', '^german$'),
        ('314', '^french$'),
        ('335', '^luganda$'),
        ('336', '^kiswahili$'),
        ('456', '^(mathematics|maths?)$'),
        ('527', '^agricultur'),
        ('535', '^physics$'),
        ('545', '^chemistry$'),
        ('553', '^biology$'),
        ('555', '^physical education'),
        ('612', '^(fine art|art and design|art & design|art)$'),
        ('840', '^(ict|computer studies|information (and|&) communications? technology)$'),
        ('845', '^entrepreneurship')
    ),
    matches as (
      select s.id, p.uneb_code,
             row_number() over (partition by s.curriculum_id, p.uneb_code order by s.code) as rn,
             count(*) over (partition by s.id) as codes_for_subject
      from subject s
      join patterns p on lower(trim(s.name)) ~ p.pattern
      where s.phase = 'O_LEVEL' and s.school_id is null and s.uneb_code is null
        and not exists (
          select 1 from subject t
           where t.curriculum_id = s.curriculum_id and t.school_id is null and t.uneb_code = p.uneb_code)
    )
    update subject s set uneb_code = m.uneb_code
    from matches m
    where m.id = s.id and m.rn = 1 and m.codes_for_subject = 1;
  `);
};

exports.down = () => {};
