import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";

export interface SchoolAdminRecord {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  createdAt: string;
}

export interface SchoolAdminInput {
  email: string;
  phoneNumber?: string | null;
}

interface SchoolAdminRow {
  id: string;
  email: string | null;
  phone_number: string | null;
  created_at: string;
}

function mapRow(row: SchoolAdminRow): SchoolAdminRecord {
  return {
    id: row.id,
    email: row.email,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
  };
}

export async function listSchoolAdmins(schoolId: string): Promise<SchoolAdminRecord[]> {
  const result = await pool.query<SchoolAdminRow>(
    `select id, email, phone_number, created_at from users
     where school_id = $1 and role = 'admin'
     order by created_at`,
    [schoolId],
  );
  return result.rows.map(mapRow);
}

// Returns null if schoolId doesn't exist — the route turns that into a 404.
export async function createSchoolAdmin(
  schoolId: string,
  input: SchoolAdminInput,
): Promise<{ admin: SchoolAdminRecord; tempPassword: string } | null> {
  const schoolExists = await pool.query(`select 1 from schools where id = $1`, [schoolId]);
  if (schoolExists.rowCount === 0) return null;

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const email = input.email.trim().toLowerCase();

  const result = await pool.query<SchoolAdminRow>(
    `insert into users (school_id, email, phone_number, password_hash, role)
     values ($1, $2, $3, $4, 'admin')
     returning id, email, phone_number, created_at`,
    [schoolId, email, input.phoneNumber ?? null, passwordHash],
  );

  return { admin: mapRow(result.rows[0]), tempPassword };
}

export async function deleteSchoolAdmin(schoolId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from users where id = $1 and school_id = $2 and role = 'admin'`,
    [userId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
