export type TicketKind = 'problem' | 'feature' | 'question';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketReply {
  id: number;
  body: string;
  fromSupport: boolean;
  createdAt: string;
}

export interface Ticket {
  id: number;
  kind: TicketKind;
  subject: string;
  description: string;
  pageUrl: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  replyCount: number;
  /** Only on the owner's inbox. */
  reporter?: {
    id: string;
    name: string | null;
    role: string;
    email: string | null;
    phoneNumber: string | null;
    systemId: string | null;
    schoolName: string | null;
  };
}

export interface TicketDetail extends Ticket {
  replies: TicketReply[];
}

export const KIND_LABEL: Record<TicketKind, string> = {
  problem: 'Something isn’t working',
  feature: 'Feature request',
  question: 'Question',
};

export const KIND_SHORT: Record<TicketKind, string> = {
  problem: 'Problem',
  feature: 'Feature',
  question: 'Question',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_VARIANT: Record<TicketStatus, 'default' | 'accent' | 'success' | 'muted'> = {
  open: 'accent',
  in_progress: 'default',
  resolved: 'success',
  closed: 'muted',
};

export const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Staff',
  school_admin: 'School Admin',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const TEXTAREA_CLASS =
  'w-full rounded-xl border-2 border-[#E5E5E5] bg-white px-4 py-2.5 text-sm focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/10';
