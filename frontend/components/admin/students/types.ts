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
  members: StudentCombinationMember[];
}
