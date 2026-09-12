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
  | "exams"
  | "schools"
  | "students"
  | "student_import"
  | "staff"
  | "organization"
  | "accounts"
  | "student_portal"
  | "parent_portal"
  | "notifications"
  | "account_settings"
  | "staff_account"
  | "portal_home";

interface FeatureMeta {
  label: string;
  ready: boolean;
}

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
  dashboard: { label: "Dashboard", ready: false },
  // The bare portal landing (/staff, /school-admin, /admin). It's navigation,
  // not a feature — gating it behind the not-ready `dashboard` locked every
  // signed-in teacher out of their own portal with a "Dementa is cooking"
  // wall. The per-portal index pages degrade gracefully on their own when a
  // stats endpoint 404s.
  portal_home: { label: "Portal", ready: true },
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
  // Super-admin exam_session catalog (/admin/system/exams) + the school_admin's
  // own exam activation (/school-admin/exams). Backed by /api/v1/exams.
  exams: { label: "Exams", ready: true },
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
  // Super-admin cross-tenant Accounts page (/admin/system/accounts) — list,
  // reset password, activate/deactivate, edit contact, issue parent logins.
  accounts: { label: "Account Management", ready: true },
  // Bulk student CSV import — backend never built (deferred, see Phase 3A
  // notes). No nav entry points here any more; kept gated so a direct visit
  // shows ComingSoon rather than a page wired to dead routes.
  student_import: { label: "Student Import", ready: false },
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
  // One tabbed page: School Admins / Staff / Students / Parents / Super Admins.
  // Bulk student CSV import stays its own (still-unwired) sub-route.
  { prefix: "/admin/system/students/import", key: "student_import" },
  { prefix: "/admin/system/exams", key: "exams" },
  { prefix: "/admin/system/accounts", key: "accounts" },
  { prefix: "/admin/system/library", key: "library" },
  { prefix: "/admin/system", key: "portal_home" },
  { prefix: "/admin/assessments", key: "assessments" },
  { prefix: "/admin/marking", key: "marking" },
  { prefix: "/admin/library", key: "library" },
  { prefix: "/admin/performance", key: "performance" },
  { prefix: "/admin/lessons", key: "lessons" },

  { prefix: "/staff/account", key: "staff_account" },
  { prefix: "/staff/exam-marks", key: "exams" },
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
  { prefix: "/school-admin/exams", key: "exams" },
  { prefix: "/school-admin/grading-schemes", key: "exams" },
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
  { prefix: "/parent/dashboard", key: "portal_home" },

  { prefix: "/student/library", key: "student_portal" },
  { prefix: "/student/results", key: "student_portal" },
  { prefix: "/student/list", key: "student_portal" },
  { prefix: "/student/take", key: "student_portal" },
  { prefix: "/student/paper", key: "student_portal" },
  { prefix: "/student/practice", key: "student_portal" },
  { prefix: "/student/attempts", key: "student_portal" },
  { prefix: "/student/confirmation", key: "student_portal" },
  { prefix: "/student/dashboard", key: "portal_home" },

  // Bare portal landing pages.
  { prefix: "/school-admin", key: "portal_home" },
  { prefix: "/staff", key: "portal_home" },
  { prefix: "/admin", key: "portal_home" },
];

export function featureForPath(pathname: string): { key: FeatureKey; meta: FeatureMeta } | null {
  const hit = ROUTE_FEATURES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!hit) return null;
  return { key: hit.key, meta: FEATURES[hit.key] };
}
