import type { Role } from '@/lib/auth/session';

/** The one place that decides which portal a role lands in after /auth. */
export const PORTAL_FOR_ROLE: Partial<Record<Role, string>> = {
  student: '/student/dashboard',
  staff: '/staff',
  // The only role the backend actually assigns to a teaching-staff account
  // (backend/src/modules/teachers/domain/staff.repository.ts inserts
  // role='teacher', never 'staff') — without this entry a real teacher login
  // had no destination and landed on "No portal available".
  teacher: '/staff',
  admin: '/admin',
  super_admin: '/admin/system',
  school_admin: '/school-admin',
  parent: '/parent/dashboard',
};
