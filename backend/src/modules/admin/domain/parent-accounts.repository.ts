import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";
import type { MutationResult } from "./accounts.repository.js";

// The Parents tab is really a guardian roster (guardian is a data-only table,
// migration 1700000018000). A guardian gets a login lazily: `guardian.user_id`
// points at a `users` row with role 'parent', school_id NULL (school-less like
// super_admin — a guardian can have children at several schools). This is the
// pragmatic shortcut ahead of the account/account_link unification sketched in
// docs/design/accounts-module.md.

export interface GuardianAccountRecord {
  guardianId: string;
  name: string;
  phone: string | null;
  email: string | null;
  userId: string | null;
  isActive: boolean | null;
  mustChangePassword: boolean | null;
  createdAt: string;
  students: { name: string; systemId: string | null; schoolName: string | null }[];
  schools: string[];
}

interface GuardianRow {
  guardian_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  user_id: string | null;
  is_active: boolean | null;
  must_change_password: boolean | null;
  created_at: string;
  students: { name: string; systemId: string | null; schoolName: string | null }[] | null;
}

export async function listGuardianAccounts(): Promise<GuardianAccountRecord[]> {
  const { rows } = await pool.query<GuardianRow>(
    `select g.id as guardian_id,
            trim(concat_ws(' ', g.first_name, g.last_name)) as name,
            g.phone, g.email, g.user_id,
            u.is_active, u.must_change_password, g.created_at,
            coalesce(
              jsonb_agg(
                distinct jsonb_build_object(
                  'name', trim(concat_ws(' ', st.first_name, st.last_name)),
                  'systemId', su.system_id,
                  'schoolName', sc.name
                )
              ) filter (where st.user_id is not null),
              '[]'::jsonb
            ) as students
     from guardian g
     left join users u on u.id = g.user_id
     left join student_guardian sg on sg.guardian_id = g.id
     left join students st on st.user_id = sg.student_user_id
     left join users su on su.id = st.user_id
     left join schools sc on sc.id = su.school_id
     where g.merged_into_guardian_id is null
     group by g.id, u.is_active, u.must_change_password
     order by name`,
  );

  return rows.map((row) => {
    const students = row.students ?? [];
    return {
      guardianId: row.guardian_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      userId: row.user_id,
      isActive: row.is_active,
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
      students,
      schools: [...new Set(students.map((s) => s.schoolName).filter((s): s is string => !!s))],
    };
  });
}

export async function createParentAccount(
  guardianId: string,
): Promise<MutationResult<{ temporaryPassword: string; phoneNumber: string | null; email: string | null }>> {
  const { rows } = await pool.query<{
    id: string;
    phone: string | null;
    email: string | null;
    user_id: string | null;
  }>(
    `select id, phone, email, user_id from guardian
     where id = $1 and merged_into_guardian_id is null`,
    [guardianId],
  );
  const guardian = rows[0];
  if (!guardian) return { ok: false, error: "not_found" };
  if (guardian.user_id) return { ok: false, error: "account_exists" };

  const phone = guardian.phone?.trim() || null;
  const email = guardian.email?.trim().toLowerCase() || null;
  if (!phone && !email) return { ok: false, error: "no_contact" };

  // A parent logs in by phone or email; refuse if one already belongs to
  // another parent login rather than guessing they're the same person
  // (accounts-module.md §4).
  const clash = await pool.query(
    `select 1 from users
     where role = 'parent' and (
       ($1::text is not null and phone_number = $1) or
       ($2::text is not null and email = $2)
     )
     limit 1`,
    [phone, email],
  );
  if (clash.rowCount && clash.rowCount > 0) return { ok: false, error: "identifier_in_use" };

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `insert into users (school_id, email, phone_number, password_hash, role, must_change_password)
       values (null, $1, $2, $3, 'parent', true)
       returning id`,
      [email, phone, passwordHash],
    );
    await client.query(`update guardian set user_id = $1, updated_at = now() where id = $2`, [
      inserted.rows[0].id,
      guardianId,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") {
      return { ok: false, error: "identifier_in_use" };
    }
    throw err;
  } finally {
    client.release();
  }

  return { ok: true, data: { temporaryPassword, phoneNumber: phone, email } };
}
