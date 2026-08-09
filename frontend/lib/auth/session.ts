import "server-only";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import type { Role } from "./roles";

export const SESSION_COOKIE = "school_os_token";

export interface SessionPayload {
  user_id: string;
  role: Role;
  school_id: string | null;
}

// Verifies the same JWT the backend sets as an HttpOnly cookie on login —
// this is the frontend's read side of that cookie, never issued here.
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as SessionPayload;
  } catch {
    return null;
  }
}
