// Shapes returned by /api/v1/communications. Mirrors
// backend/src/modules/communications/domain/{rooms,messages}.repository.ts.

export type RoomKind = 'direct' | 'group' | 'staff_room' | 'announcements' | 'class' | 'class_parents';

export interface Person {
  userId: string;
  name: string;
  role: string;
  photoUrl: string | null;
  online: boolean;
}

export interface LastMessage {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  hasAttachment: boolean;
  attachmentName: string | null;
  isVoice?: boolean;
  deleted: boolean;
  createdAt: string;
}

export interface RoomSummary {
  id: string;
  schoolId: string;
  kind: RoomKind;
  title: string;
  description: string | null;
  onlyAdminsPost: boolean;
  archived: boolean;
  myRole: 'admin' | 'member' | null;
  muted: boolean;
  canPost: boolean;
  memberCount: number;
  unreadCount: number;
  lastReadAt: string | null;
  lastMessage: LastMessage | null;
  lastMessageAt: string | null;
  createdAt: string;
  other: Person | null;
  photoUrl: string | null;
}

export interface RoomMember extends Person {
  roomRole: 'admin' | 'member';
  lastReadAt: string | null;
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  membersComplete: boolean;
  reactions: string[];
}

export interface Attachment {
  url: string;
  name: string;
  mimeType: string;
  size: number | null;
  isImage: boolean;
  isVoice: boolean;
  durationMs: number | null;
  /** Bar heights 0-100. */
  waveform: number[] | null;
}

export interface ReplyPreview {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  attachmentName: string | null;
  isVoice?: boolean;
  deleted: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  sender: Person | null;
  body: string;
  replyTo: ReplyPreview | null;
  attachment: Attachment | null;
  reactions: { emoji: string; userIds: string[] }[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  /** Client-only: still on its way to the server. */
  pending?: boolean;
}

export interface Contact extends Person {
  schoolId: string;
  subtitle: string;
}

export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const KIND_LABEL: Record<RoomKind, string> = {
  direct: 'Private chat',
  group: 'Group',
  staff_room: 'Staff room',
  announcements: 'Announcements',
  class: 'Class group',
  class_parents: 'Parents group',
};
