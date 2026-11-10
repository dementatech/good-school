/* eslint-disable */
exports.shorthands = undefined;

// Migration 079 first shipped with Arabic as P350, but UNEB's UACE timetable
// has Arabic as P370 and P350 as Latin. 079 is now corrected; this fixes
// databases that already ran the old version. Re-tags Arabic subjects from
// P350 to P370, then tags Latin as P350 where the name clearly matches and
// the code is free in that curriculum. Running it on a database that ran the
// corrected 079 changes nothing.

exports.up = (pgm) => {
  pgm.sql(`
    update subject set uneb_code = 'P370', updated_at = now()
     where uneb_code = 'P350' and lower(trim(name)) ~ 'arabic';

    with latin as (
      select s.id,
             row_number() over (partition by s.curriculum_id order by s.code) as rn
        from subject s
       where s.phase = 'A_LEVEL' and s.school_id is null and s.uneb_code is null
         and s.category <> 'subsidiary' and lower(trim(s.name)) ~ '^latin$'
         and not exists (
           select 1 from subject t
            where t.curriculum_id = s.curriculum_id and t.school_id is null and t.uneb_code = 'P350'
         )
    )
    update subject s set uneb_code = 'P350', updated_at = now()
      from latin l
     where l.id = s.id and l.rn = 1;
  `);
};

// Nothing to undo safely: the codes it fixes were wrong.
exports.down = () => {};
