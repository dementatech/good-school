export type AccountTab =
  | 'school-admins'
  | 'staff'
  | 'students'
  | 'parents'
  | 'super-admins';

/** A user-backed account row (every tab except Parents). */
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
  className?: string | null;
}

/** A guardian row on the Parents tab — `userId` null until a login is issued. */
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

export interface AccountSummary {
  schoolAdmins: number;
  staff: number;
  students: number;
  parents: number;
  superAdmins: number;
}

export interface RevealedCredentials {
  name: string;
  systemId: string | null;
  temporaryPassword: string;
  hasEmail: boolean;
}

// The one super-admin account that can never be deactivated — kept in step
// with the backend's own last-active-super-admin guard, and matching the
// previous standalone super-admins page.
export const ROOT_SUPER_ADMIN_EMAIL = 'victordementa@gmail.com';

export function accountDisplayName(a: { name: string | null; email: string | null; systemId: string | null }): string {
  return a.name || a.email || a.systemId || '—';
}
