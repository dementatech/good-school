// Mirrors backend/src/modules/events/domain/events.repository.ts

export type SchoolEventType = 'holiday' | 'exam' | 'meeting' | 'deadline' | 'other';
export type SchoolEventAudience = 'all' | 'staff' | 'students' | 'parents';

export interface SchoolEvent {
  id: string;
  /** null = a global platform event, managed by super_admin. */
  schoolId: string | null;
  title: string;
  description: string | null;
  eventDate: string;
  eventType: SchoolEventType;
  audience: SchoolEventAudience;
  /** Set when this event is auto-synced from an exam — not editable/deletable here. */
  schoolExamId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EVENT_TYPE_LABEL: Record<SchoolEventType, string> = {
  holiday: 'Holiday',
  exam: 'Exam',
  meeting: 'Meeting',
  deadline: 'Deadline',
  other: 'Other',
};

export const EVENT_AUDIENCE_LABEL: Record<SchoolEventAudience, string> = {
  all: 'Everyone',
  staff: 'Staff',
  students: 'Students',
  parents: 'Parents',
};

export { submitJson } from '@/lib/api/envelope';
