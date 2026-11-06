import { pool } from "../../../shared/db/index.js";
import { fileUrl, type StorageProvider } from "../../../shared/media.js";
import { isOnline } from "../../realtime/index.js";

// Who someone is, for chat purposes: a display name and a photo, whatever
// table their identity lives in (staff for school admins and teachers,
// students, guardian for parents, or nothing but the users row).

export type ChatRole = "school_admin" | "teacher" | "student" | "parent";

export const STAFF_ROLES: ChatRole[] = ["school_admin", "teacher"];

export function isStaff(role: string): boolean {
  return role === "school_admin" || role === "teacher";
}

/** A subquery with one row per user: user_id, role, school_id, is_active,
 *  name, photo_path, photo_provider. Join it as `join (${PERSON_SQL}) p on ...`. */
export const PERSON_SQL = `
  select u.id as user_id, u.role::text as role, u.school_id, u.is_active,
         coalesce(nullif(trim(concat_ws(' ', s.first_name, s.last_name)), ''),
                  nullif(trim(concat_ws(' ', st.first_name, st.last_name)), ''),
                  nullif(trim(concat_ws(' ', g.first_name, g.last_name)), ''),
                  u.email, u.system_id, 'Unknown user') as name,
         coalesce(s.photo_path, st.photo_path, u.photo_path) as photo_path,
         case when s.photo_path is not null then s.photo_provider
              when st.photo_path is not null then st.photo_provider
              else u.photo_provider end as photo_provider
    from users u
    left join staff s on s.user_id = u.id
    left join students st on st.user_id = u.id
    left join lateral (
      select first_name, last_name from guardian
       where user_id = u.id and merged_into_guardian_id is null
       limit 1
    ) g on true`;

export interface PersonRow {
  user_id: string;
  role: string;
  school_id: string | null;
  is_active: boolean;
  name: string;
  photo_path: string | null;
  photo_provider: StorageProvider | null;
}

export interface Person {
  userId: string;
  name: string;
  role: string;
  photoUrl: string | null;
  online: boolean;
}

export function photoUrlOf(path: string | null, provider: StorageProvider | null): string | null {
  if (!path) return null;
  return fileUrl({ provider: provider ?? "local", ref: path, mimeType: "image/jpeg" });
}

export function toPerson(row: PersonRow): Person {
  return {
    userId: row.user_id,
    name: row.name,
    role: row.role,
    photoUrl: photoUrlOf(row.photo_path, row.photo_provider),
    online: isOnline(row.user_id),
  };
}

export async function findPeople(userIds: string[]): Promise<Map<string, Person>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, Person>();
  if (ids.length === 0) return out;
  const { rows } = await pool.query<PersonRow>(`select p.* from (${PERSON_SQL}) p where p.user_id = any($1::uuid[])`, [
    ids,
  ]);
  for (const row of rows) out.set(row.user_id, toPerson(row));
  return out;
}

/** Schools a parent belongs to through their children. */
export async function parentSchoolIds(parentUserId: string): Promise<string[]> {
  const { rows } = await pool.query<{ school_id: string }>(
    `select distinct su.school_id
       from guardian g
       join student_guardian sg on sg.guardian_id = g.id
       join users su on su.id = sg.student_user_id
      where g.user_id = $1 and g.merged_into_guardian_id is null and su.school_id is not null`,
    [parentUserId],
  );
  return rows.map((r) => r.school_id);
}

/** Every school this user can chat in: their own, or their children's for a parent. */
export async function chatSchoolIds(user: { user_id: string; role: string; school_id: string | null }): Promise<string[]> {
  if (user.role === "parent") return parentSchoolIds(user.user_id);
  if (user.school_id && (isStaff(user.role) || user.role === "student")) return [user.school_id];
  return [];
}
