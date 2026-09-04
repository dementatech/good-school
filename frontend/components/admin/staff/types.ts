// Mirrors backend/src/modules/teachers/domain/{staff,staff-assignment,staff-specialization,
// subject-teacher-assignment}.repository.ts

export type Gender = 'male' | 'female';
export type TmisStatus = 'registered' | 'pending' | 'not_registered';
export type EmploymentType = 'government' | 'private' | 'pta' | 'volunteer';
// A different axis from EmploymentType (who pays vs. time commitment).
export type EmploymentBasis = 'fulltime' | 'parttime' | 'practicing';
export type StaffRole = 'teacher' | 'head_teacher' | 'deputy' | 'bursar' | 'admin' | 'support';
export type AssignmentEntryType = 'new_hire' | 'transfer' | 'government_posting';
export type AssignmentExitType = 'transfer' | 'resignation' | 'retirement' | 'government_reposting';
export type AssignmentStatus = 'active' | 'transferred_out' | 'left' | 'retired';

export interface StaffAssignment {
  id: string;
  staffId: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  role: StaffRole;
  entryDate: string;
  entryType: AssignmentEntryType;
  exitDate: string | null;
  exitType: AssignmentExitType | null;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StaffSpecialization {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export interface Staff {
  userId: string;
  systemId: string | null;
  tmisNumber: string | null;
  tmisStatus: TmisStatus;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  qualification: string | null;
  employmentType: EmploymentType;
  employmentBasis: EmploymentBasis | null;
  photoUrl: string | null;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  activeAssignment: StaffAssignment | null;
  specializations: StaffSpecialization[];
}

export interface SubjectTeacherAssignment {
  id: string;
  schoolId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  academicYearId: string;
  classId: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  staffId: string;
  staffName: string;
  staffSystemId: string | null;
  isLead: boolean;
  status: 'active' | 'ended';
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface AllocationGap {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  issue: 'no_teacher_assigned';
}

export interface StaffCandidate {
  staffId: string;
  staffName: string;
  staffSystemId: string | null;
}

export interface AcademicYear {
  id: string;
  yearName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export const GENDERS: readonly Gender[] = ['male', 'female'];
export const TMIS_STATUSES: readonly TmisStatus[] = ['registered', 'pending', 'not_registered'];
export const TMIS_STATUS_LABEL: Record<TmisStatus, string> = {
  registered: 'Registered',
  pending: 'Pending',
  not_registered: 'Not registered',
};
export const EMPLOYMENT_TYPES: readonly EmploymentType[] = ['government', 'private', 'pta', 'volunteer'];
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  government: 'Government',
  private: 'Private',
  pta: 'PTA',
  volunteer: 'Volunteer',
};
export const EMPLOYMENT_BASES: readonly EmploymentBasis[] = ['fulltime', 'parttime', 'practicing'];
export const EMPLOYMENT_BASIS_LABEL: Record<EmploymentBasis, string> = {
  fulltime: 'Full-time',
  parttime: 'Part-time',
  practicing: 'Practicing (on teaching practice / not yet certified)',
};
// A controlled list rather than free text (matches every other "pick from
// known values, don't invent one" field in this system) — covers the
// qualification levels actually relevant to Ugandan secondary teaching
// staff. "Other" stays free text for the genuine outlier.
export const QUALIFICATIONS = [
  'Grade III Teaching Certificate',
  'Grade V Teaching Certificate',
  'Diploma in Education',
  "Bachelor's Degree (Education)",
  "Bachelor's Degree + PGDE",
  "Master's Degree",
  'PhD',
  'Other',
] as const;
export const STAFF_ROLES: readonly StaffRole[] = [
  'teacher',
  'head_teacher',
  'deputy',
  'bursar',
  'admin',
  'support',
];
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  teacher: 'Teacher',
  head_teacher: 'Head teacher',
  deputy: 'Deputy head teacher',
  bursar: 'Bursar',
  admin: 'Admin / office staff',
  support: 'Support staff',
};
export const ENTRY_TYPES: readonly AssignmentEntryType[] = ['new_hire', 'transfer', 'government_posting'];
export const ENTRY_TYPE_LABEL: Record<AssignmentEntryType, string> = {
  new_hire: 'New hire',
  transfer: 'Transfer from another school',
  government_posting: 'Government posting',
};
export const EXIT_TYPES: readonly AssignmentExitType[] = [
  'transfer',
  'resignation',
  'retirement',
  'government_reposting',
];
export const EXIT_TYPE_LABEL: Record<AssignmentExitType, string> = {
  transfer: 'Transferred to another school',
  resignation: 'Resigned',
  retirement: 'Retired',
  government_reposting: 'Government re-posting',
};

export function staffFullName(s: Pick<Staff, 'firstName' | 'middleName' | 'lastName'>): string {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
}
