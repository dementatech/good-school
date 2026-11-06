import { pool } from "../../../shared/db/index.js";
import { PERSON_SQL, chatSchoolIds, isStaff, toPerson, type Person, type PersonRow } from "./people.js";

// Who may start a private chat with whom. The school chose the
// staff-supervised rule:
//
//   school admin, teacher -> anyone in the school (staff, students, parents)
//   parent                -> staff at a school one of their children attends
//   student               -> the school's admins, and the teachers who teach
//                            them this year (class, stream or subject teacher)
//
// No student <-> student and no parent <-> parent private chats. Groups are
// a separate matter (staff create them; see rooms.repository.ts).

export interface Caller {
  user_id: string;
  role: string;
  school_id: string | null;
}

/** Everyone `caller` may start a direct chat with in `schoolId`, as a SQL
 *  query of user ids. $1 = schoolId, $2 = caller user id. */
function candidateSql(role: string): string | null {
  // Active parents of anyone at this school.
  const parentsOfSchool = `
    select g.user_id as id
      from guardian g
      join student_guardian sg on sg.guardian_id = g.id
      join users su on su.id = sg.student_user_id
     where su.school_id = $1 and g.user_id is not null and g.merged_into_guardian_id is null`;
  const staffOfSchool = `select id from users where school_id = $1 and role in ('school_admin','teacher')`;

  if (isStaff(role)) {
    return `${staffOfSchool}
      union select id from users where school_id = $1 and role = 'student'
      union ${parentsOfSchool}`;
  }
  if (role === "parent") return staffOfSchool;
  if (role === "student") {
    return `
      select id from users where school_id = $1 and role = 'school_admin'
      union
      select t.id from student_enrollment en
        join classes c on c.id = en.class_id
        left join streams s on s.id = en.stream_id
        cross join lateral (values (c.class_teacher_id), (s.stream_teacher_id)) t(id)
       where en.student_user_id = $2 and en.school_id = $1 and en.status = 'active' and t.id is not null
      union
      select sta.staff_id from student_enrollment en
        join subject_teacher_assignment sta
          on sta.class_id = en.class_id and sta.academic_year_id = en.academic_year_id
         and sta.status = 'active' and (sta.stream_id is null or sta.stream_id = en.stream_id)
       where en.student_user_id = $2 and en.school_id = $1 and en.status = 'active'`;
  }
  return null;
}

/** The school a direct chat between caller and target would belong to, or
 *  null if the rule above doesn't allow it. */
export async function directChatSchool(caller: Caller, targetUserId: string): Promise<string | null> {
  if (targetUserId === caller.user_id) return null;
  const sql = candidateSql(caller.role);
  if (!sql) return null;
  for (const schoolId of await chatSchoolIds(caller)) {
    const { rows } = await pool.query(
      `select 1 from (${sql}) c join users u on u.id = c.id
        where c.id = $3 and u.is_active and u.id <> $2 limit 1`,
      [schoolId, caller.user_id, targetUserId],
    );
    if (rows.length > 0) return schoolId;
  }
  return null;
}

export interface Contact extends Person {
  schoolId: string;
  /** "Teacher", "S.2 East", "Parent of Amina Nakato", ... */
  subtitle: string;
}

const ROLE_LABEL: Record<string, string> = {
  school_admin: "School admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

/** People the caller may start a chat with, filtered by name, staff first. */
export async function listContacts(
  caller: Caller,
  opts: { q?: string | null; role?: string | null; limit?: number },
): Promise<Contact[]> {
  const sql = candidateSql(caller.role);
  if (!sql) return [];
  const limit = Math.min(opts.limit ?? 40, 100);
  const out: Contact[] = [];
  for (const schoolId of await chatSchoolIds(caller)) {
    const { rows } = await pool.query<PersonRow>(
      `select p.* from (${sql}) c
         join (${PERSON_SQL}) p on p.user_id = c.id
        where p.is_active and p.user_id <> $2
          and ($3::text is null or p.name ilike '%' || $3 || '%')
          and ($4::text is null or p.role = $4)
        order by (p.role in ('school_admin','teacher')) desc, p.name
        limit $5`,
      [schoolId, caller.user_id, opts.q?.trim() || null, opts.role || null, limit],
    );
    const subtitles = await describe(schoolId, rows);
    for (const row of rows) {
      out.push({ ...toPerson(row), schoolId, subtitle: subtitles.get(row.user_id) ?? ROLE_LABEL[row.role] ?? "" });
    }
  }
  return out.slice(0, limit);
}

/** A short line under each name: a student's class, a parent's children. */
async function describe(schoolId: string, rows: PersonRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const students = rows.filter((r) => r.role === "student").map((r) => r.user_id);
  const parents = rows.filter((r) => r.role === "parent").map((r) => r.user_id);

  if (students.length > 0) {
    const { rows: classes } = await pool.query<{ user_id: string; label: string }>(
      `select en.student_user_id as user_id,
              stage_label(c.school_id, c.curriculum_stage_id) || coalesce(' ' || s.name, '') as label
         from student_enrollment en
         join classes c on c.id = en.class_id
         left join streams s on s.id = en.stream_id
        where en.student_user_id = any($1::uuid[]) and en.status = 'active'`,
      [students],
    );
    for (const c of classes) out.set(c.user_id, `Student · ${c.label}`);
  }
  if (parents.length > 0) {
    const { rows: kids } = await pool.query<{ user_id: string; names: string }>(
      `select g.user_id, string_agg(distinct trim(concat_ws(' ', st.first_name, st.last_name)), ', ') as names
         from guardian g
         join student_guardian sg on sg.guardian_id = g.id
         join students st on st.user_id = sg.student_user_id
         join users su on su.id = st.user_id
        where g.user_id = any($1::uuid[]) and su.school_id = $2
        group by g.user_id`,
      [parents, schoolId],
    );
    for (const k of kids) out.set(k.user_id, `Parent of ${k.names}`);
  }
  return out;
}
