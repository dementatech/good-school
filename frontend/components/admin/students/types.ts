// Mirrors backend/src/modules/students/domain/{students,enrollments,guardians}.repository.ts

export type Gender = 'male' | 'female';
export type LinStatus = 'verified' | 'pending' | 'not_yet_issued';
export type EntryType = 'new_admission' | 'transfer' | 'repeat' | 're_admission_s5';
export type ExitType = 'transfer' | 'withdrawal' | 'completion' | 'no_show';
export type EnrollmentStatus =
  | 'applied'
  | 'admitted'
  | 'active'
  | 'transferred_out'
  | 'withdrawn'
  | 'graduated'
  | 'no_show';
export type GuardianRole = 'parent' | 'sponsor' | 'guardian';

export interface EnrollmentRecord {
  id: string;
  studentUserId: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  classId: string;
  stageCode: string;
  stageName: string;
  stagePhase: 'O_LEVEL' | 'A_LEVEL';
  streamId: string | null;
  streamName: string | null;
  entryDate: string;
  entryType: EntryType;
  exitDate: string | null;
  exitType: ExitType | null;
  status: EnrollmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  userId: string;
  systemId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  lin: string | null;
  linStatus: LinStatus;
  email: string | null;
  phoneNumber: string | null;
  /** Active SchoolPay payment code for this student at this school, if set. */
  paymentCode: string | null;
  isActive: boolean;
  createdAt: string;
  activeEnrollment: EnrollmentRecord | null;
}

export interface StudentGuardian {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  nin: string | null;
  relationshipToStudent: string | null;
  source: string;
  createdAt: string;
  role: GuardianRole;
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
  matchedExisting?: boolean;
}

export interface AcademicYear {
  id: string;
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface SchoolClass {
  id: string;
  academicYearId: string;
  curriculumStageId: string;
  stageCode: string;
  stageName: string;
  stagePhase: 'O_LEVEL' | 'A_LEVEL';
  hasStreams: boolean;
  isActive: boolean;
}

export interface Stream {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

export const GENDERS: readonly Gender[] = ['male', 'female'];
export const LIN_STATUSES: readonly LinStatus[] = ['verified', 'pending', 'not_yet_issued'];
export const LIN_STATUS_LABEL: Record<LinStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  not_yet_issued: 'Not yet issued',
};
export const ENTRY_TYPES: readonly EntryType[] = [
  'new_admission',
  'transfer',
  'repeat',
  're_admission_s5',
];
export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  new_admission: 'New admission',
  transfer: 'Transfer',
  repeat: 'Repeat',
  re_admission_s5: 'Re-admission (S4→S5)',
};
export const EXIT_TYPES: readonly ExitType[] = ['transfer', 'withdrawal', 'completion', 'no_show'];
export const EXIT_TYPE_LABEL: Record<ExitType, string> = {
  transfer: 'Transferred to another school',
  withdrawal: 'Withdrawn / dropped out',
  completion: 'Completed (graduated)',
  no_show: 'Never attended (no-show)',
};
export const GUARDIAN_ROLES: readonly GuardianRole[] = ['parent', 'sponsor', 'guardian'];

export function studentFullName(s: Pick<Student, 'firstName' | 'middleName' | 'lastName'>): string {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
}

// Mirrors backend/src/modules/students/domain/{student-subjects,student-combinations}.repository.ts

export type StudentSubjectStatus = 'active' | 'dropped' | 'added';

export interface StudentSubject {
  id: string;
  studentUserId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: string;
  academicYearId: string;
  status: StudentSubjectStatus;
  statusChangedAt: string;
  reason: string | null;
}

export interface StudentCombinationMember {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  role: 'principal' | 'subsidiary' | 'compulsory';
}

export interface StudentCombination {
  id: string;
  studentUserId: string;
  schoolCombinationId: string;
  combinationCode: string;
  combinationName: string;
  subsidiarySubjectId: string | null;
  academicYearId: string;
  status: 'pending' | 'confirmed' | 'reassigned';
  selectedAt: string;
  eligibilityOverrideReason: string | null;
  members: StudentCombinationMember[];
  warnings: string[];
}

// Mirrors backend/src/modules/students/domain/prior-exams.repository.ts

export type PriorExamType = 'PLE' | 'UCE';

export interface PriorExamSubject {
  principalSubjectId: string;
  principalSubjectCode: string;
  principalSubjectName: string;
  grade: string;
}

export interface PriorExam {
  id: string;
  studentUserId: string;
  schoolId: string;
  enrollmentId: string | null;
  examType: PriorExamType;
  examYear: number;
  candidateNumber: string | null;
  aggregate: number | null;
  divisionOrResult: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: PriorExamSubject[];
}

export const PRIOR_EXAM_TYPES: readonly PriorExamType[] = ['PLE', 'UCE'];
export const PRIOR_EXAM_TYPE_LABEL: Record<PriorExamType, string> = {
  PLE: 'PLE (Primary Leaving Exam)',
  UCE: 'UCE (O-Level)',
};

// PLE aggregate → division (legacy 1–9 per-subject scale, 4 subjects, 4–36).
// docs/design/uganda-secondary-school-foundations.md §4.1.
export const PLE_DIVISIONS = ['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Ungraded (U)'];
// UCE: legacy Division 1–4 / Fail, or NLSC "Result" statuses.
export const UCE_RESULTS = [
  'Division 1',
  'Division 2',
  'Division 3',
  'Division 4',
  'Fail',
  'Result 1',
  'Result 2',
  'Result 3',
];
