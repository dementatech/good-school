/**
 * Client-safe identity types.
 *
 * The old TERECO version of this file held server-side Supabase session
 * resolution (`getCurrentProfile`, `requireRole`, …). That logic now lives in
 * the Fastify backend (`backend/src/modules/auth`). The frontend only needs
 * the shared shapes here; the server-side JWT read used by `proxy.ts` is in
 * `./session-jwt.ts`.
 */

/**
 * Role vocabulary. The backend currently issues `student | teacher | parent |
 * admin | super_admin`; the ported TERECO UI still speaks `staff` /
 * `school_admin`. Both are kept here during the migration — see
 * `./roles-map.ts` for the normalisation between them.
 */
export type Role =
  | "super_admin"
  | "admin"
  | "school_admin"
  | "staff"
  | "teacher"
  | "student"
  | "parent";

export interface SessionProfile {
  id: string;
  role: Role;
  /** Convenience join of the name parts. */
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  systemId: string | null;
  schoolId: string | null;
  mustChangePassword: boolean;
}
