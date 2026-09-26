import { pool } from "../../../shared/db/index.js";
import type { Role } from "../../../shared/types/index.js";
import type { IdentifierKind } from "./identifier.js";
import { deleteStoredFile, fileUrl, storeFile, type StorageProvider } from "../../../shared/media.js";

export interface AuthUserRecord {
  id: string;
  school_id: string | null;
  system_id: string | null;
  email: string | null;
  phone_number: string | null;
  password_hash: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  /** Only read by findUserById — see migrations/1700000072000_support-desk.cjs. */
  is_platform_owner?: boolean;
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
    `select id, school_id, system_id, email, phone_number, password_hash, role,
            is_active, must_change_password
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

/** Profile photo for a role with no other identity table to hang one off —
 *  parent, school_admin, super_admin. Teacher stays on staff.photo_path (see
 *  teachers/domain/staff.repository.ts's findStaffPhotoUrl) since the admin
 *  staff directory already reads from there. */
export async function findUserPhotoUrl(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ photo_path: string | null; photo_provider: StorageProvider | null }>(
    `select photo_path, photo_provider from users where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row?.photo_path) return null;
  return fileUrl({ provider: row.photo_provider ?? "local", ref: row.photo_path, mimeType: "image/jpeg" });
}

/** Same store/replace/clear shape as setStaffPhoto — see there for why the
 *  prior file is deleted only after the new row is committed. */
export async function setUserPhoto(
  userId: string,
  file: { mimeType: string; data: Buffer } | null,
): Promise<string | null> {
  const { rows } = await pool.query<{ photo_path: string | null; photo_provider: StorageProvider | null }>(
    `select photo_path, photo_provider from users where id = $1`,
    [userId],
  );
  const prior = rows[0];

  let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
  if (file) stored = await storeFile("avatars", file.mimeType, file.data);

  await pool.query(`update users set photo_path = $1, photo_provider = $2, updated_at = now() where id = $3`, [
    stored?.ref ?? null,
    stored?.provider ?? null,
    userId,
  ]);

  if (prior?.photo_path) {
    await deleteStoredFile({ provider: prior.photo_provider ?? "local", ref: prior.photo_path, mimeType: "image/jpeg" });
  }

  return stored ? fileUrl(stored) : null;
}

export async function findUserById(id: string): Promise<AuthUserRecord | null> {
  const result = await pool.query<AuthUserRecord>(
    `select id, school_id, system_id, email, phone_number, password_hash, role,
            is_active, must_change_password, is_platform_owner
     from users
     where id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}
