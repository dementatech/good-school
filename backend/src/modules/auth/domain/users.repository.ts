import { pool } from "../../../shared/db/index.js";
import type { Role } from "../../../shared/types/index.js";
import type { IdentifierKind } from "./identifier.js";

export interface AuthUserRecord {
  id: string;
  school_id: string | null;
  system_id: string | null;
  email: string | null;
  phone_number: string | null;
  password_hash: string;
  role: Role;
}

const COLUMN_BY_KIND: Record<IdentifierKind, string> = {
  system_id: "system_id",
  email: "email",
  phone_number: "phone_number",
};

export async function findUserByIdentifier(
  kind: IdentifierKind,
  identifier: string,
  schoolId?: string,
): Promise<AuthUserRecord | null> {
  const column = COLUMN_BY_KIND[kind];
  const value = kind === "email" ? identifier.trim().toLowerCase() : identifier.trim();

  const conditions = [`${column} = $1`];
  const params: unknown[] = [value];

  if (schoolId) {
    conditions.push(`school_id = $2`);
    params.push(schoolId);
  }

  const result = await pool.query<AuthUserRecord>(
    `select id, school_id, system_id, email, phone_number, password_hash, role
     from users
     where ${conditions.join(" and ")}
     limit 1`,
    params,
  );

  return result.rows[0] ?? null;
}

// Every account matching a "forgot password" identifier. Not school-scoped
// (the reset form has no school context) and returns all matches — an email
// can be reused across schools, and each such account gets its own link.
export async function findUsersByIdentifierForReset(
  kind: IdentifierKind,
  identifier: string,
): Promise<{ id: string; email: string | null }[]> {
  const column = COLUMN_BY_KIND[kind];
  const value = kind === "email" ? identifier.trim().toLowerCase() : identifier.trim();

  const result = await pool.query<{ id: string; email: string | null }>(
    `select id, email from users where ${column} = $1`,
    [value],
  );
  return result.rows;
}

export async function findUserById(id: string): Promise<AuthUserRecord | null> {
  const result = await pool.query<AuthUserRecord>(
    `select id, school_id, system_id, email, phone_number, password_hash, role
     from users
     where id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}
