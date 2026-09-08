import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";

// The unified shape the super-admin Accounts page renders for every tab. Name
// is null for roles with no profile table (school_admin, super_admin) — their
// email is the login identity and the UI falls back to it.
export interface AccountRecord {
  id: string;
  role: string;
  systemId: string | null;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  schoolId: string | null;
  schoolName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  // Students only — their current class, for the roster column.
  className?: string | null;
}

export type AccountType =
  | "school-admins"
  | "staff"
  | "students"
  | "super-admins";

interface AccountRow {
  id: string;
  role: string;
  system_id: string | null;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  school_id: string | null;
  school_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  class_name?: string | null;
}

function mapRow(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    role: row.role,
    systemId: row.system_id,
    name: row.name,
    email: row.email,
    phoneNumber: row.phone_number,
    schoolId: row.school_id,
    schoolName: row.school_name,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    className: row.class_name ?? null,
  };
}

const BASE = `
  select u.id, u.role, u.system_id, u.email, u.phone_number,
         u.school_id, sc.name as school_name,
         u.is_active, u.must_change_password, u.created_at
  from users u
  left join schools sc on sc.id = u.school_id
`;

export async function listAccounts(type: AccountType): Promise<AccountRecord[]> {
  if (type === "school-admins") {
    const { rows } = await pool.query<AccountRow>(
      `${BASE} where u.role = 'school_admin' order by u.created_at desc`,
    );
    return rows.map(mapRow);
  }

  if (type === "super-admins") {
    const { rows } = await pool.query<AccountRow>(
      `${BASE} where u.role = 'super_admin' order by u.created_at`,
    );
    return rows.map(mapRow);
  }

  if (type === "staff") {
    // Platform `admin` accounts show here too (no school) — same "staff who
    // sign in" bucket, the UI badges them.
    const { rows } = await pool.query<AccountRow>(
      `select u.id, u.role, u.system_id, u.email, u.phone_number,
              u.school_id, sc.name as school_name,
              u.is_active, u.must_change_password, u.created_at,
              nullif(trim(concat_ws(' ', s.first_name, s.last_name)), '') as name
       from users u
       left join schools sc on sc.id = u.school_id
       left join staff s on s.user_id = u.id
       where u.role in ('teacher', 'admin')
       order by name nulls last, u.created_at desc`,
    );
    return rows.map(mapRow);
  }

  // students
  const { rows } = await pool.query<AccountRow>(
    `select u.id, u.role, u.system_id, u.email, u.phone_number,
            u.school_id, sc.name as school_name,
            u.is_active, u.must_change_password, u.created_at,
            nullif(trim(concat_ws(' ', st.first_name, st.last_name)), '') as name,
            cs.name as class_name
     from users u
     left join schools sc on sc.id = u.school_id
     join students st on st.user_id = u.id
     left join student_enrollment se
       on se.student_user_id = u.id and se.status = 'active'
     left join classes cl on cl.id = se.class_id
     left join curriculum_stage cs on cs.id = cl.curriculum_stage_id
     where u.role = 'student'
     order by name nulls last, u.created_at desc`,
  );
  return rows.map(mapRow);
}

export interface AccountSummary {
  schoolAdmins: number;
  staff: number;
  students: number;
  parents: number;
  superAdmins: number;
}

export async function accountSummary(): Promise<AccountSummary> {
  const { rows } = await pool.query<{ role: string; count: string }>(
    `select role, count(*)::text as count from users group by role`,
  );
  const by = (r: string) => Number(rows.find((x) => x.role === r)?.count ?? 0);
  const { rows: guardianRows } = await pool.query<{ count: string }>(
    `select count(*)::text as count from guardian where merged_into_guardian_id is null`,
  );
  return {
    schoolAdmins: by("school_admin"),
    staff: by("teacher") + by("admin"),
    students: by("student"),
    parents: Number(guardianRows[0]?.count ?? 0),
    superAdmins: by("super_admin"),
  };
}

export interface AccountLookup {
  id: string;
  role: string;
  email: string | null;
  isActive: boolean;
}

async function lookup(userId: string): Promise<AccountLookup | null> {
  const { rows } = await pool.query<AccountLookup>(
    `select id, role, email, is_active as "isActive" from users where id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function resetAccountPassword(
  userId: string,
): Promise<MutationResult<{ temporaryPassword: string }>> {
  const account = await lookup(userId);
  if (!account) return { ok: false, error: "not_found" };

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await pool.query(
    `update users set password_hash = $1, must_change_password = true, updated_at = now()
     where id = $2`,
    [passwordHash, userId],
  );
  return { ok: true, data: { temporaryPassword } };
}

// Bulk reset for the DataTable "include passwords in the export" option —
// same shape as resetStaffPasswords / resetStudentPasswords, silently skips
// any id that isn't a user.
export async function resetAccountPasswords(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `select id from users where id = any($1::uuid[])`,
      [userIds],
    );
    const passwords: Record<string, string> = {};
    for (const row of rows) {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      await client.query(
        `update users set password_hash = $1, must_change_password = true, updated_at = now()
         where id = $2`,
        [passwordHash, row.id],
      );
      passwords[row.id] = tempPassword;
    }
    await client.query("COMMIT");
    return passwords;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setAccountActive(
  userId: string,
  isActive: boolean,
  actingUserId: string,
): Promise<MutationResult<AccountRecord>> {
  const account = await lookup(userId);
  if (!account) return { ok: false, error: "not_found" };

  if (!isActive) {
    if (userId === actingUserId) return { ok: false, error: "cannot_disable_self" };
    if (account.role === "super_admin") {
      const { rows } = await pool.query<{ count: string }>(
        `select count(*)::text as count from users
         where role = 'super_admin' and is_active = true and id <> $1`,
        [userId],
      );
      if (Number(rows[0].count) === 0) return { ok: false, error: "last_super_admin" };
    }
  }

  await pool.query(
    `update users set is_active = $1, updated_at = now() where id = $2`,
    [isActive, userId],
  );
  return { ok: true, data: (await getAccount(userId))! };
}

export async function updateAccountContact(
  userId: string,
  input: { email?: string | null; phoneNumber?: string | null },
): Promise<MutationResult<AccountRecord>> {
  const account = await lookup(userId);
  if (!account) return { ok: false, error: "not_found" };

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.email !== undefined) {
    params.push(input.email ? input.email.trim().toLowerCase() : null);
    sets.push(`email = $${params.length}`);
  }
  if (input.phoneNumber !== undefined) {
    params.push(input.phoneNumber ? input.phoneNumber.trim() : null);
    sets.push(`phone_number = $${params.length}`);
  }
  if (sets.length === 0) return { ok: true, data: (await getAccount(userId))! };

  params.push(userId);
  try {
    await pool.query(
      `update users set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`,
      params,
    );
  } catch (err) {
    // Partial unique indexes on (school_id, email) / (school_id, phone_number).
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") {
      return { ok: false, error: "identifier_in_use" };
    }
    throw err;
  }
  return { ok: true, data: (await getAccount(userId))! };
}

export async function getAccount(userId: string): Promise<AccountRecord | null> {
  const { rows } = await pool.query<AccountRow>(
    `${BASE} where u.id = $1`,
    [userId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
