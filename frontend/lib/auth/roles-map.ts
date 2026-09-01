import type { Role } from "@/lib/auth/session";

/**
 * The backend JWT issues `student | teacher | parent | school_admin | admin |
 * super_admin`; the ported TERECO UI says `staff` where the backend says
 * `teacher`. Everything else lines up 1:1 after Phase 2A added `school_admin`
 * to the backend enum.
 */
const BACKEND_TO_UI: Record<string, Role> = {
  teacher: "staff",
  staff: "staff",
  student: "student",
  parent: "parent",
  school_admin: "school_admin",
  admin: "admin",
  super_admin: "super_admin",
};

export function normalizeRole(role: string): Role {
  return BACKEND_TO_UI[role] ?? (role as Role);
}
