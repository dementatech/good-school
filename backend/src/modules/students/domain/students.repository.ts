import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";
import { nextSystemId } from "./system-id.js";

export interface StudentRecord {
  userId: string;
  systemId: string | null;
  fullName: string;
  dateOfBirth: string | null;
  className: string | null;
  email: string | null;
  phoneNumber: string | null;
  enrolledAt: string;
  isActive: boolean;
}

export interface StudentInput {
  fullName: string;
  dateOfBirth?: string | null;
  className?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

interface StudentRow {
  user_id: string;
  system_id: string | null;
  full_name: string;
  date_of_birth: string | null;
  class_name: string | null;
  email: string | null;
  phone_number: string | null;
  enrolled_at: string;
  is_active: boolean;
}

const SELECT_STUDENT = `
  select u.id as user_id, u.system_id, u.email, u.phone_number,
         s.full_name, s.date_of_birth, s.class_name, s.enrolled_at, s.is_active
  from students s
  join users u on u.id = s.user_id
`;

function mapRow(row: StudentRow): StudentRecord {
  return {
    userId: row.user_id,
    systemId: row.system_id,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    className: row.class_name,
    email: row.email,
    phoneNumber: row.phone_number,
    enrolledAt: row.enrolled_at,
    isActive: row.is_active,
  };
}

export async function listStudents(schoolId: string): Promise<StudentRecord[]> {
  const result = await pool.query<StudentRow>(
    `${SELECT_STUDENT} where u.school_id = $1 order by s.full_name`,
    [schoolId],
  );
  return result.rows.map(mapRow);
}

export async function getStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  const result = await pool.query<StudentRow>(
    `${SELECT_STUDENT} where u.school_id = $1 and u.id = $2`,
    [schoolId, userId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createStudent(
  schoolId: string,
  input: StudentInput,
): Promise<{ student: StudentRecord; tempPassword: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const systemId = await nextSystemId(client, schoolId, "STU");
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const userResult = await client.query<{ id: string }>(
      `insert into users (school_id, system_id, email, phone_number, password_hash, role)
       values ($1, $2, $3, $4, $5, 'student')
       returning id`,
      [schoolId, systemId, input.email ?? null, input.phoneNumber ?? null, passwordHash],
    );
    const userId = userResult.rows[0].id;

    const studentResult = await client.query<StudentRow>(
      `insert into students (user_id, full_name, date_of_birth, class_name)
       values ($1, $2, $3, $4)
       returning user_id, $5::text as system_id, $6::text as email, $7::text as phone_number,
                 full_name, date_of_birth, class_name, enrolled_at, is_active`,
      [
        userId,
        input.fullName,
        input.dateOfBirth ?? null,
        input.className ?? null,
        systemId,
        input.email ?? null,
        input.phoneNumber ?? null,
      ],
    );

    await client.query("COMMIT");

    return { student: mapRow(studentResult.rows[0]), tempPassword };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStudent(
  schoolId: string,
  userId: string,
  input: StudentInput,
): Promise<StudentRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owns = await client.query(
      `select 1 from users where id = $1 and school_id = $2 and role = 'student'`,
      [userId, schoolId],
    );
    if (owns.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `update users set email = $1, phone_number = $2, updated_at = now() where id = $3`,
      [input.email ?? null, input.phoneNumber ?? null, userId],
    );

    await client.query(
      `update students
       set full_name = $1, date_of_birth = $2, class_name = $3, updated_at = now()
       where user_id = $4`,
      [input.fullName, input.dateOfBirth ?? null, input.className ?? null, userId],
    );

    await client.query("COMMIT");

    return getStudent(schoolId, userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStudent(schoolId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from users where id = $1 and school_id = $2 and role = 'student'`,
    [userId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function setStudentActive(
  schoolId: string,
  userId: string,
  isActive: boolean,
): Promise<StudentRecord | null> {
  const owns = await pool.query(
    `select 1 from users where id = $1 and school_id = $2 and role = 'student'`,
    [userId, schoolId],
  );
  if (owns.rowCount === 0) return null;

  await pool.query(`update students set is_active = $1, updated_at = now() where user_id = $2`, [
    isActive,
    userId,
  ]);

  return getStudent(schoolId, userId);
}

// Soft delete — keeps academic history, just stops showing up as an active
// enrollment. Separate from deleteStudent, which is a hard, permanent delete.
export async function archiveStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  return setStudentActive(schoolId, userId, false);
}

export async function restoreStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  return setStudentActive(schoolId, userId, true);
}

// Bulk reset for the "include passwords" export option — generates a fresh
// temp password per id and returns userId -> password. Silently skips any id
// that isn't actually a student in this school (no error for a stale/foreign
// id slipping into a batch), same spirit as the single-row helpers above.
export async function resetStudentPasswords(
  schoolId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query<{ id: string }>(
      `select id from users where school_id = $1 and role = 'student' and id = any($2::uuid[])`,
      [schoolId, userIds],
    );

    const passwords: Record<string, string> = {};
    for (const row of owned.rows) {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      await client.query(`update users set password_hash = $1, updated_at = now() where id = $2`, [
        passwordHash,
        row.id,
      ]);
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
