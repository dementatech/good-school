export type OwnershipType =
  | 'government'
  | 'private'
  | 'community'
  | 'religious'
  | 'international';
export type RegistrationStatus = 'registered' | 'licensed' | 'provisional' | 'unregistered';
export type SchoolType = 'day' | 'boarding' | 'mixed';
export type GenderComposition = 'boys' | 'girls' | 'mixed';
export type OnboardingStatus = 'pending_verification' | 'active' | 'suspended' | 'churned';

export interface SchoolCurriculumRef {
  curriculumId: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface School {
  id: string;
  name: string;
  legalName: string | null;
  slug: string | null;
  emisCode: string | null;
  unebCentreNumber: string | null;
  ownershipType: OwnershipType | null;
  registrationStatus: RegistrationStatus | null;
  district: string | null;
  subCounty: string | null;
  address: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  headTeacherName: string | null;
  headTeacherContact: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  schoolType: SchoolType | null;
  genderComposition: GenderComposition | null;
  offersOLevel: boolean;
  offersALevel: boolean;
  onboardingStatus: OnboardingStatus;
  verifiedAt: string | null;
  dataImportSource: 'fresh' | 'migrated' | null;
  userCount: number;
  curricula: SchoolCurriculumRef[];
  createdAt: string;
}

export const OWNERSHIP: OwnershipType[] = [
  'government',
  'private',
  'community',
  'religious',
  'international',
];
export const REGISTRATION: RegistrationStatus[] = [
  'registered',
  'licensed',
  'provisional',
  'unregistered',
];
export const SCHOOL_TYPES: SchoolType[] = ['day', 'boarding', 'mixed'];
export const GENDERS: GenderComposition[] = ['boys', 'girls', 'mixed'];

export const STATUS_LABEL: Record<OnboardingStatus, string> = {
  pending_verification: 'Pending verification',
  active: 'Active',
  suspended: 'Suspended',
  churned: 'Churned',
};
export const STATUS_VARIANT: Record<OnboardingStatus, 'default' | 'accent' | 'success' | 'muted'> = {
  pending_verification: 'accent',
  active: 'success',
  suspended: 'muted',
  churned: 'muted',
};
