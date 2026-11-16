/* eslint-disable */
exports.shorthands = undefined;

// Checked against UNEB's UCE (new lower secondary curriculum) timetable for
// October/November 2024. 082 first shipped with Art & Design as 610; it is
// 612. This moves any 610 to 612, then tags the O-Level subjects 082 didn't
// cover (other languages, Performing Arts, Nutrition, Technology & Design,
// General Science) where the name clearly matches. Same rules as 082: one
// subject per code per curriculum, nothing already set is overwritten.

exports.up = (pgm) => {
  pgm.sql(`
    update subject s set uneb_code = '612', updated_at = now()
     where s.phase = 'O_LEVEL' and s.uneb_code = '610'
       and not exists (select 1 from subject t
                        where t.curriculum_id = s.curriculum_id and t.school_id is null and t.uneb_code = '612');

    with patterns (uneb_code, pattern) as (
      values
        ('612', '^(fine art|art and design|art & design|art)$'),
        ('301', '^latin$'),
        ('305', '^(leb )?acoli$'),
        ('315', '^(leb )?lango$'),
        ('325', '^lugbara'),
        ('337', '^arabic$'),
        ('345', '^runyankore'),
        ('355', '^lusoga$'),
        ('365', '^ateso$'),
        ('375', '^dhopadhola$'),
        ('385', '^runyoro'),
        ('395', '^lumasaaba$'),
        ('396', '^chinese$'),
        ('397', '^(ugandan )?sign language'),
        ('500', '^general science$'),
        ('621', '^performing arts?$'),
        ('662', '^nutrition'),
        ('745', '^technology (and|&) design$')
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
    update subject s set uneb_code = m.uneb_code, updated_at = now()
    from matches m
    where m.id = s.id and m.rn = 1 and m.codes_for_subject = 1;
  `);
};

exports.down = () => {};
