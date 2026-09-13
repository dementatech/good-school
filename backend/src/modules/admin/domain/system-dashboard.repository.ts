import { pool } from "../../../shared/db/index.js";

// The super-admin dashboard (frontend/app/admin/page.tsx) — every query here
// is deliberately system-wide (no school_id filter), matching the same
// unfiltered "students"/"staff"/"parents" semantics as accountSummary() in
// accounts.repository.ts (which this stats query mirrors, plus a schools
// count neither it nor anything else computes today).

export interface SystemStats {
  schools: number;
  staff: number;
  students: number;
  parents: number;
}

export async function getSystemStats(): Promise<SystemStats> {
  const { rows } = await pool.query<{ role: string; count: string }>(
    `select role, count(*)::text as count from users group by role`,
  );
  const by = (r: string) => Number(rows.find((x) => x.role === r)?.count ?? 0);

  const { rows: schoolRows } = await pool.query<{ count: string }>(`select count(*)::text as count from schools`);
  const { rows: guardianRows } = await pool.query<{ count: string }>(
    `select count(*)::text as count from guardian where merged_into_guardian_id is null`,
  );

  return {
    schools: Number(schoolRows[0]?.count ?? 0),
    staff: by("teacher") + by("admin"),
    students: by("student"),
    parents: Number(guardianRows[0]?.count ?? 0),
  };
}

export interface GenderBreakdownEntry {
  gender: "male" | "female" | "unspecified";
  count: number;
}

export async function getGenderBreakdown(): Promise<GenderBreakdownEntry[]> {
  const { rows } = await pool.query<{ gender: GenderBreakdownEntry["gender"]; count: string }>(
    `select coalesce(gender, 'unspecified') as gender, count(*)::text as count
       from students
      group by coalesce(gender, 'unspecified')`,
  );
  return rows.map((r) => ({ gender: r.gender, count: Number(r.count) }));
}

export interface PopulationEntry {
  label: string;
  count: number;
}

// Active enrollments only — "population by class" has no meaning for a
// student with no current placement.
export async function getPopulationByClass(): Promise<PopulationEntry[]> {
  const { rows } = await pool.query<{ label: string; count: string }>(
    `select cs.name as label, count(*)::text as count
       from student_enrollment en
       join classes c on c.id = en.class_id
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where en.status = 'active'
      group by cs.name, cs.sequence_number
      order by cs.sequence_number`,
  );
  return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
}

export interface ActivityItem {
  type: "enrollment" | "submission";
  label: string;
  timestamp: string;
}

export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const [enrollments, submissions] = await Promise.all([
    pool.query<{ name: string; stage_name: string; stream_name: string | null; school_name: string; created_at: string }>(
      `select trim(concat_ws(' ', s.first_name, s.last_name)) as name,
              cs.name as stage_name, st.name as stream_name, sc.name as school_name,
              en.created_at
         from student_enrollment en
         join students s on s.user_id = en.student_user_id
         join classes c on c.id = en.class_id
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
         left join streams st on st.id = en.stream_id
         join schools sc on sc.id = en.school_id
        order by en.created_at desc
        limit $1`,
      [limit],
    ),
    pool.query<{ subject_name: string; stage_name: string; stream_name: string | null; school_name: string; submitted_at: string }>(
      `select sub.name as subject_name,
              cs.name as stage_name, st.name as stream_name, sc.name as school_name,
              sub2.submitted_at
         from exam_subject_submission sub2
         join subject sub on sub.id = sub2.subject_id
         join classes c on c.id = sub2.class_id
         join curriculum_stage cs on cs.id = c.curriculum_stage_id
         left join streams st on st.id = sub2.stream_id
         join school_exam se on se.id = sub2.school_exam_id
         join schools sc on sc.id = se.school_id
        order by sub2.submitted_at desc
        limit $1`,
      [limit],
    ),
  ]);

  const items: ActivityItem[] = [
    ...enrollments.rows.map((r) => ({
      type: "enrollment" as const,
      label: `${r.name} enrolled — ${r.stage_name}${r.stream_name ? ` ${r.stream_name}` : ""} · ${r.school_name}`,
      timestamp: r.created_at,
    })),
    ...submissions.rows.map((r) => ({
      type: "submission" as const,
      label: `${r.subject_name} marks submitted — ${r.stage_name}${r.stream_name ? ` ${r.stream_name}` : ""} · ${r.school_name}`,
      timestamp: r.submitted_at,
    })),
  ];

  return items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, limit);
}
