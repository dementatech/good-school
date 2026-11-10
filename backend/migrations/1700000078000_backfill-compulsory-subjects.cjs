/* eslint-disable */
exports.shorthands = undefined;

// Backfill: before this, compulsory O-Level subjects were only attached when
// the admission wizard sent them, so S1 admissions, bulk imports and
// repeat/transfer enrollments ended up with none. createEnrollment now
// attaches them (students/domain/student-subjects.repository.ts →
// attachCompulsorySubjects); this does the same for every student who
// already has an active O-Level enrollment.
//
// Step 1 mirrors seedAlwaysOnOfferings (academic-structure/domain/
// subject-offering.repository.ts) for each school/year with such an
// enrollment, so years nobody opened the Subjects page for still get their
// core subjects + General Paper offerings. Step 2 attaches every offered +
// compulsory O-Level subject. Both are idempotent (on conflict do nothing),
// and existing student_subject rows, dropped ones included, are left alone.

exports.up = (pgm) => {
  pgm.sql(`
    with targets as (
      select distinct se.school_id, se.academic_year_id
      from student_enrollment se
      join classes c on c.id = se.class_id
      join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where se.status = 'active' and cs.phase = 'O_LEVEL'
    )
    insert into subject_offering (school_id, subject_id, academic_year_id, is_offered, is_compulsory)
    select t.school_id, s.id, t.academic_year_id, true, true
    from targets t
    join schools sch on sch.id = t.school_id
    join school_curriculum sc on sc.school_id = t.school_id
    join subject s on s.curriculum_id = sc.curriculum_id
    where s.is_active
      and (case s.phase
             when 'KINDERGARTEN' then sch.offers_kindergarten
             when 'PRIMARY' then sch.offers_primary
             when 'O_LEVEL' then sch.offers_o_level
             when 'A_LEVEL' then sch.offers_a_level
             else true
           end)
      and (s.school_id is null or s.school_id = t.school_id)
      and ((s.category = 'core' or s.is_general_paper) and s.school_id is null
           or (s.school_id = t.school_id and s.phase = 'KINDERGARTEN'))
    on conflict (school_id, subject_id, academic_year_id) do nothing;
  `);

  pgm.sql(`
    insert into student_subject (student_user_id, school_id, subject_id, academic_year_id, status)
    select se.student_user_id, se.school_id, o.subject_id, se.academic_year_id, 'active'
    from student_enrollment se
    join classes c on c.id = se.class_id
    join curriculum_stage cs on cs.id = c.curriculum_stage_id
    join subject_offering o
      on o.school_id = se.school_id and o.academic_year_id = se.academic_year_id
     and o.is_offered and o.is_compulsory
    join subject s on s.id = o.subject_id
    where se.status = 'active' and cs.phase = 'O_LEVEL'
      and s.phase = 'O_LEVEL' and s.is_active
    on conflict (student_user_id, subject_id, academic_year_id) do nothing;
  `);
};

// Not reversible: backfilled rows can't be told apart from ones admins
// registered, and they may already carry marks/attendance.
exports.down = () => {};
