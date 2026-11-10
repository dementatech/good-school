import type { ChatMessage, LastMessage } from './types';

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "14:05" today, "Yesterday", "Mon" this week, "12/10/26" before that. */
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** The label of the day divider above a run of messages. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function isSameDay(a: string, b: string): boolean {
  return sameDay(new Date(a), new Date(b));
}

export function lastMessagePreview(m: LastMessage | null, myUserId: string | undefined, isGroup: boolean): string {
  if (!m) return 'No messages yet';
  if (m.deleted) return 'This message was deleted';
  const who = m.senderUserId === myUserId ? 'You: ' : isGroup && m.senderName ? `${m.senderName.split(' ')[0]}: ` : '';
  const text =
    m.body.trim() || (m.isVoice ? '🎤 Voice message' : m.hasAttachment ? `📎 ${m.attachmentName ?? 'Attachment'}` : '');
  return who + text;
}

export function messageSnippet(m: Pick<ChatMessage, 'body' | 'attachment' | 'deletedAt'>): string {
  if (m.deletedAt) return 'This message was deleted';
  if (m.attachment?.isVoice) return m.body.trim() || `🎤 Voice message (${clock(m.attachment.durationMs ?? 0)})`;
  return m.body.trim() || (m.attachment ? (m.attachment.isImage ? '📷 Photo' : `📎 ${m.attachment.name}`) : '');
}

/** 0:07, 1:42, 12:05 */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
