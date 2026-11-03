import { pool } from "../../../shared/db/index.js";
import type { SchoolLevel } from "../../../shared/levels.js";

const ACTIVITY_LIMIT = 6;
const TREND_LIMIT = 6;

export interface ClassPopulation {
  classId: string;
  code: string;
  name: string;
  boys: number;
  girls: number;
  total: number;
}

export type ActivityType = "enrollment" | "submission";

export interface ActivityItem {
  type: ActivityType;
  label: string;
  timestamp: string;
}

export interface SchoolAnalytics {
  counts: { students: number; staff: number; classes: number };
  gender: { male: number; female: number; unspecified: number };
  population: ClassPopulation[];
  activity: ActivityItem[];
}

export interface TrendPoint {
  examId: string;
  /** Short axis label, e.g. "T2 EOT". */
  label: string;
  name: string;
  /** Average mark as a percentage, one decimal place. */
  value: number;
}

/**
 * `levels` is the school section being worked in, or null for all of them.
 * Learners not yet placed in a class count in every section, the same rule as
 * the student list, so the two totals agree.
 */
export async function getSchoolAnalytics(schoolId: string, levels: SchoolLevel[] | null): Promise<SchoolAnalytics> {
  const [students, staff, population, activity] = await Promise.all([
    pool.query<{ total: string; male: string; female: string }>(
      `select count(*)::text as total,
              count(*) filter (where s.gender = 'male')::text as male,
              count(*) filter (where s.gender = 'female')::text as female
         from students s
         join users u on u.id = s.user_id
         left join student_enrollment se on se.student_user_id = s.user_id and se.school_id = u.school_id and se.status = 'active'
         left join classes c on c.id = se.class_id
         left join curriculum_stage cs on cs.id = c.curriculum_stage_id
        where u.school_id = $1 and s.is_active
          and ($2::text[] is null or se.id is null or cs.phase = any($2::text[]))`,
      [schoolId, levels],
    ),
    pool.query<{ total: string }>(
      `select count(*)::text as total
         from staff s
         join users u on u.id = s.user_id
        where u.school_id = $1 and s.is_active`,
      [schoolId],
    ),
    pool.query<{ class_id: string; code: string; name: string; boys: string; girls: string; total: string }>(
      `select c.id as class_id, cs.code, stage_label(c.school_id, cs.id) as name,
              count(st.user_id) filter (where st.gender = 'male')::text as boys,
              count(st.user_id) filter (where st.gender = 'female')::text as girls,
              count(st.user_id)::text as total
         from classes c
         join academic_years ay on ay.id = c.academic_year_id and ay.is_current
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
         left join student_enrollment se on se.class_id = c.id and se.status = 'active'
         left join students st on st.user_id = se.student_user_id and st.is_active
        where c.school_id = $1 and c.is_active and ($2::text[] is null or cs.phase = any($2::text[]))
        group by c.id, cs.id, cs.sequence_number
        order by cs.sequence_number`,
      [schoolId, levels],
    ),
    pool.query<{ type: ActivityType; label: string; timestamp: Date }>(
      `(select 'enrollment' as type,
               trim(s.first_name || ' ' || s.last_name) || ' joined ' || stage_label(se.school_id, cs.id) as label,
               se.created_at as timestamp
          from student_enrollment se
          join students s on s.user_id = se.student_user_id
          join classes c on c.id = se.class_id
          join curriculum_stage cs on cs.id = c.curriculum_stage_id
         where se.school_id = $1 and ($2::text[] is null or cs.phase = any($2::text[]))
         order by se.created_at desc
         limit $3)
       union all
       (select 'submission' as type,
               subj.name || ' marks submitted for ' || stage_label(c.school_id, cs.id) as label,
               ess.submitted_at as timestamp
          from exam_subject_submission ess
          join school_exam sx on sx.id = ess.school_exam_id
          join subject subj on subj.id = ess.subject_id
          join classes c on c.id = ess.class_id
          join curriculum_stage cs on cs.id = c.curriculum_stage_id
         where sx.school_id = $1 and ($2::text[] is null or cs.phase = any($2::text[]))
         order by ess.submitted_at desc
         limit $3)
       order by timestamp desc
       limit $3`,
      [schoolId, levels, ACTIVITY_LIMIT],
    ),
  ]);

  const counted = students.rows[0];
  const total = Number(counted.total);
  const male = Number(counted.male);
  const female = Number(counted.female);

  return {
    counts: { students: total, staff: Number(staff.rows[0].total), classes: population.rows.length },
    gender: { male, female, unspecified: total - male - female },
    population: population.rows.map((row) => ({
      classId: row.class_id,
      code: row.code,
      name: row.name,
      boys: Number(row.boys),
      girls: Number(row.girls),
      total: Number(row.total),
    })),
    activity: activity.rows.map((row) => ({
      type: row.type,
      label: row.label,
      timestamp: row.timestamp.toISOString(),
    })),
  };
}

/**
 * The latest published exams, oldest first. Marks are out of each subject's own
 * maximum, so they're compared as percentages. Absent learners have no score
 * and don't pull the average down.
 */
export async function getPerformanceTrend(schoolId: string, levels: SchoolLevel[] | null): Promise<TrendPoint[]> {
  const { rows } = await pool.query<{
    exam_id: string;
    name: string;
    term_number: number | null;
    exam_code: string;
    value: string;
  }>(
    `select * from (
       select sx.id as exam_id, sx.name, t.term_number, es.exam_code, sx.published_at,
              round(avg(er.raw_score * 100.0 / nullif(coalesce(er.max_mark, 100), 0)), 1)::text as value
         from school_exam sx
         join exam_session es on es.id = sx.exam_session_id
         left join terms t on t.id = sx.term_id
         join exam_result er on er.school_exam_id = sx.id and er.raw_score is not null and not er.is_absent
        where sx.school_id = $1 and sx.published_at is not null
          and ($2::text[] is null or exists (
                select 1
                  from student_enrollment se
                  join classes c on c.id = se.class_id
                  join curriculum_stage cs on cs.id = c.curriculum_stage_id
                 where se.student_user_id = er.student_user_id
                   and se.academic_year_id = sx.academic_year_id
                   and cs.phase = any($2::text[])))
        group by sx.id, t.term_number, es.exam_code
        order by sx.published_at desc
        limit $3
     ) recent
     order by published_at`,
    [schoolId, levels, TREND_LIMIT],
  );
  return rows.map((row) => ({
    examId: row.exam_id,
    label: row.term_number ? `T${row.term_number} ${row.exam_code}` : row.exam_code,
    name: row.name,
    value: Number(row.value),
  }));
}
