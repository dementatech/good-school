import { fetchOne, submitJson } from '@/lib/api/envelope';
import type { ChatMessage, Contact, RoomDetail, RoomSummary } from './types';

const BASE = '/api/v1/communications';

export const chatApi = {
  rooms: () => fetchOne<RoomSummary[]>(`${BASE}/rooms`),
  oversightRooms: (q: string) => fetchOne<RoomSummary[]>(`${BASE}/oversight/rooms${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  room: (id: string) => fetchOne<RoomDetail>(`${BASE}/rooms/${id}`),
  messages: (id: string, before?: string) =>
    fetchOne<{ messages: ChatMessage[]; hasMore: boolean }>(
      `${BASE}/rooms/${id}/messages?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    ),
  contacts: (q: string, role?: string) =>
    fetchOne<Contact[]>(
      `${BASE}/contacts?q=${encodeURIComponent(q)}${role ? `&role=${encodeURIComponent(role)}` : ''}`,
    ),
  startDirect: (userId: string) => submitJson<RoomSummary>(`${BASE}/rooms/direct`, 'POST', { userId }),
  createGroup: (body: { title: string; description?: string | null; onlyAdminsPost?: boolean; memberUserIds: string[] }) =>
    submitJson<RoomSummary>(`${BASE}/rooms/group`, 'POST', body),
  updateRoom: (id: string, body: { title?: string; description?: string | null; onlyAdminsPost?: boolean }) =>
    submitJson<RoomDetail>(`${BASE}/rooms/${id}`, 'PATCH', body),
  addMembers: (id: string, userIds: string[]) => submitJson<{ added: number }>(`${BASE}/rooms/${id}/members`, 'POST', { userIds }),
  removeMember: (id: string, userId: string) => submitJson(`${BASE}/rooms/${id}/members/${userId}`, 'DELETE'),
  setMemberRole: (id: string, userId: string, role: 'admin' | 'member') =>
    submitJson(`${BASE}/rooms/${id}/members/${userId}`, 'PATCH', { role }),
  mute: (id: string, muted: boolean) => submitJson(`${BASE}/rooms/${id}/mute`, 'PUT', { muted }),
  send: (id: string, body: string, replyToId?: string | null) =>
    submitJson<ChatMessage>(`${BASE}/rooms/${id}/messages`, 'POST', { body, replyToId: replyToId ?? null }),
  read: (id: string) => submitJson(`${BASE}/rooms/${id}/read`, 'POST'),
  typing: (id: string) => submitJson(`${BASE}/rooms/${id}/typing`, 'POST'),
  edit: (messageId: string, body: string) => submitJson<ChatMessage>(`${BASE}/messages/${messageId}`, 'PATCH', { body }),
  remove: (messageId: string) => submitJson<ChatMessage>(`${BASE}/messages/${messageId}`, 'DELETE'),
  react: (messageId: string, emoji: string) =>
    submitJson<ChatMessage>(`${BASE}/messages/${messageId}/reactions`, 'POST', { emoji }),

  /** Multipart upload. Caption and reply fields go before the file (the backend reads them from there). */
  async sendFile(
    id: string,
    file: File,
    caption: string,
    replyToId?: string | null,
  ): Promise<{ ok: boolean; error?: string; data?: ChatMessage }> {
    const form = new FormData();
    form.append('caption', caption);
    if (replyToId) form.append('replyToId', replyToId);
    form.append('file', file);
    try {
      const res = await fetch(`${BASE}/rooms/${id}/attachments`, { method: 'POST', body: form, credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) return { ok: true, data: json.data };
      if (res.status === 413) return { ok: false, error: 'That file is too big. The limit is 5 MB.' };
      return { ok: false, error: json.error || json.message || `Upload failed (${res.status}).` };
    } catch {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
  },
};
