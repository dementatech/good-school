import { pool } from "./db/index.js";

// The Director of Studies (DOS): the teacher holding the school's academic-head
// position this year — the position flagged is_academic_root in Organisation
// Studio (normally "Deputy Head Teacher — Academics / DOS").
//
// The DOS works from their own portal (/dos), which marks its requests with
// the x-portal: dos header. For the academic areas below — and only those —
// such a request from the actual DOS is treated like the school admin's, so
// the admin screens for those areas work for them unchanged. Everywhere else
// (and on their ordinary teacher pages, which don't send the header) they're
// just a teacher. The school admin keeps full access either way.

export const PORTAL_HEADER = "x-portal";

export interface DosPosition {
  positionTitle: string;
}

export async function directorOfStudies(schoolId: string, userId: string): Promise<DosPosition | null> {
  const { rows } = await pool.query<{ title: string }>(
    `select p.title
       from staff_position sp
       join position p on p.id = sp.position_id
       join academic_years ay on ay.id = sp.academic_year_id and ay.is_current
      where p.school_id = $1 and p.is_academic_root and sp.staff_id = $2 and sp.status = 'active'
      limit 1`,
    [schoolId, userId],
  );
  return rows[0] ? { positionTitle: rows[0].title } : null;
}

// The DOS's areas: lesson preparation, timetables, attendance, exams and
// report cards, subjects and curriculum (with classes, grading, Nursery
// progress), plus reading the staff list for teacher pickers.
const DOS_AREAS: { prefix: string; readOnly?: boolean }[] = [
  { prefix: "/api/v1/lesson-prep" },
  { prefix: "/api/v1/timetable" },
  { prefix: "/api/v1/attendance" },
  { prefix: "/api/v1/exams" },
  { prefix: "/api/v1/academic" },
  { prefix: "/api/v1/early-years" },
  { prefix: "/api/v1/subject-teacher-assignments" },
  { prefix: "/api/v1/staff", readOnly: true },
];

export function isDosArea(method: string, url: string): boolean {
  const path = url.split("?")[0];
  return DOS_AREAS.some(
    (a) =>
      (path === a.prefix || path.startsWith(`${a.prefix}/`)) && (!a.readOnly || method === "GET" || method === "HEAD"),
  );
}
