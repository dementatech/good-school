/**
 * Feature activation registry.
 *
 * The TERECO UI was ported wholesale, but its 136 API routes are being moved to
 * the Fastify backend one feature at a time. Until a feature's backend exists,
 * its pages render the "Dementa is cooking" screen instead of erroring.
 *
 * Flip a flag to `true` the moment its backend module is live and wired to
 * `/api/v1/*`. Later this static map becomes a per-school `school_features`
 * table the super-admin toggles — the shape here (`FeatureKey`) stays.
 */

export type FeatureKey =
  | "dashboard"
  | "assessments"
  | "marking"
  | "library"
  | "performance"
  | "lessons"
  | "attendance"
  | "practical"
  | "behaviour"
  | "forms"
  | "academic_structure"
  | "schools"
  | "students"
  | "staff"
  | "organization"
  | "accounts"
  | "student_portal"
  | "parent_portal"
  | "notifications"
  | "account_settings"
  | "staff_account";

interface FeatureMeta {
  label: string;
  ready: boolean;
}

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
  dashboard: { label: "Dashboard", ready: false },
  assessments: { label: "Assessments", ready: false },
  marking: { label: "Marking", ready: false },
  library: { label: "Library", ready: false },
  performance: { label: "Performance", ready: false },
  lessons: { label: "Lessons", ready: false },
  attendance: { label: "Attendance", ready: false },
  practical: { label: "Practical Observations", ready: false },
  behaviour: { label: "Behaviour Rating", ready: false },
  forms: { label: "Data Forms", ready: false },
  academic_structure: { label: "Academic Structure", ready: true },
  schools: { label: "Schools", ready: true },
  // School-scoped student enrollment (Phase 3A). Distinct from `accounts`
  // (staff/parent/super-admin login management) — that's still unwired.
  students: { label: "Students", ready: true },
  // School-scoped staff identity, assignment, and subject-teacher allocation
  // (docs/design/teachers-module.md). Distinct from `accounts`, which is the
  // super_admin-only cross-tenant staff *account* screen at
  // /admin/system/staff — still unwired, and a separate concern from the
  // school_admin's own staff roster below (same split as `students`/`accounts`).
  staff: { label: "Staff", ready: true },
  // Departments + the position/staff_position org chart (docs/design/
  // departments-module.md, organization-studio.md) — the Organisation
  // Studio route.
  organization: { label: "Organisation Studio", ready: true },
  accounts: { label: "Account Management", ready: false },
  student_portal: { label: "Student Portal", ready: false },
  parent_portal: { label: "Parent Portal", ready: false },
  notifications: { label: "Notifications", ready: false },
  account_settings: { label: "My Account", ready: false },
  // A staff member's own profile + self-service academic document upload
  // (docs/design/teacher-staff-module.md) — distinct from `account_settings`,
  // which also governs the unrelated, still-unwired /admin/account page.
  staff_account: { label: "My Account", ready: true },
};

export function isFeatureReady(key: FeatureKey): boolean {
  return FEATURES[key]?.ready ?? false;
}

/**
 * Longest-prefix match of a pathname to the feature that owns it. Order
 * matters — more specific prefixes first.
 */
const ROUTE_FEATURES: { prefix: string; key: FeatureKey }[] = [
  { prefix: "/admin/account", key: "account_settings" },
  { prefix: "/admin/system/curriculum", key: "academic_structure" },
  { prefix: "/admin/system/academic-years", key: "academic_structure" },
  { prefix: "/admin/system/schools", key: "schools" },
  { prefix: "/admin/system/staff", key: "accounts" },
  // Cross-tenant student roster (super_admin, school picker) is deferred —
  // the students API is school-scoped only as of Phase 3A. school-admin's
  // own roster below is the real, live page.
  { prefix: "/admin/system/students", key: "accounts" },
  // Reconciliation/merge screen — deferred to Phase 3B.
  { prefix: "/admin/system/parents", key: "accounts" },
  { prefix: "/admin/system/super-admins", key: "accounts" },
  { prefix: "/admin/system/library", key: "library" },
  { prefix: "/admin/system", key: "dashboard" },
  { prefix: "/admin/assessments", key: "assessments" },
  { prefix: "/admin/marking", key: "marking" },
  { prefix: "/admin/library", key: "library" },
  { prefix: "/admin/performance", key: "performance" },
  { prefix: "/admin/lessons", key: "lessons" },

  { prefix: "/staff/account", key: "staff_account" },
  { prefix: "/staff/assessments", key: "assessments" },
  { prefix: "/staff/marking", key: "marking" },
  { prefix: "/staff/library", key: "library" },
  { prefix: "/staff/performance", key: "performance" },
  { prefix: "/staff/lessons", key: "lessons" },
  { prefix: "/staff/attendance", key: "attendance" },
  { prefix: "/staff/practical", key: "practical" },
  { prefix: "/staff/behaviour", key: "behaviour" },
  { prefix: "/staff/forms", key: "forms" },

  { prefix: "/school-admin/classes", key: "academic_structure" },
  { prefix: "/school-admin/subjects", key: "academic_structure" },
  { prefix: "/school-admin/academic-years", key: "academic_structure" },
  { prefix: "/school-admin/terms", key: "academic_structure" },
  { prefix: "/school-admin/school", key: "schools" },
  { prefix: "/school-admin/staff", key: "staff" },
  { prefix: "/school-admin/organisation-studio", key: "organization" },
  { prefix: "/school-admin/students", key: "students" },
  { prefix: "/school-admin/attendance", key: "attendance" },
  { prefix: "/school-admin/lessons", key: "lessons" },
  { prefix: "/school-admin/assessments", key: "assessments" },
  { prefix: "/school-admin/library", key: "library" },
  { prefix: "/school-admin/performance", key: "performance" },

  { prefix: "/parent/notifications", key: "notifications" },
  { prefix: "/parent/results", key: "parent_portal" },
  { prefix: "/parent/attendance", key: "parent_portal" },
  { prefix: "/parent/lessons", key: "parent_portal" },
  { prefix: "/parent/library", key: "parent_portal" },
  { prefix: "/parent/dashboard", key: "dashboard" },

  { prefix: "/student/library", key: "student_portal" },
  { prefix: "/student/results", key: "student_portal" },
  { prefix: "/student/list", key: "student_portal" },
  { prefix: "/student/take", key: "student_portal" },
  { prefix: "/student/paper", key: "student_portal" },
  { prefix: "/student/practice", key: "student_portal" },
  { prefix: "/student/attempts", key: "student_portal" },
  { prefix: "/student/confirmation", key: "student_portal" },
  { prefix: "/student/dashboard", key: "dashboard" },

  // Bare portal landing pages.
  { prefix: "/school-admin", key: "dashboard" },
  { prefix: "/staff", key: "dashboard" },
  { prefix: "/admin", key: "dashboard" },
];

export function featureForPath(pathname: string): { key: FeatureKey; meta: FeatureMeta } | null {
  const hit = ROUTE_FEATURES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!hit) return null;
  return { key: hit.key, meta: FEATURES[hit.key] };
}
