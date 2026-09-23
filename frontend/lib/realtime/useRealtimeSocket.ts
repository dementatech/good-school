'use client';

import { useEffect, useRef } from 'react';
import { submitJson } from '@/lib/api/envelope';

export interface RealtimeMessageEvent {
  type: 'message';
  conversationId: string;
  message: { id: string; senderUserId: string; body: string; createdAt: string };
}

export interface RealtimeNotificationEvent {
  type: 'notification';
  notification: {
    id: number;
    type: string;
    title: string;
    body: string;
    link: string | null;
    createdAt: string;
    isRead: boolean;
  };
}

export interface RealtimeForceSignoutEvent {
  type: 'force_signout';
  reason: string;
}

export interface RealtimeCalendarEvent {
  type: 'calendar_event';
  event: { id: string; title: string; eventDate: string };
}

/**
 * Every event shape any feature currently pushes. A new feature adds its own
 * interface here and joins this union — the socket/ticket plumbing above
 * never needs to change, since `pushToUser()` on the backend already accepts
 * any JSON-serializable payload keyed by `type`.
 */
export type RealtimeEvent =
  | RealtimeMessageEvent
  | RealtimeNotificationEvent
  | RealtimeForceSignoutEvent
  | RealtimeCalendarEvent;

function wsBase(): string {
  const httpBase = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
  return httpBase.replace(/^http/, 'ws');
}

/**
 * Opens a WebSocket straight to the backend (not through the Next.js rewrite
 * proxy, which only carries plain HTTP — see next.config.ts and the
 * backend's realtime module) for instant delivery of direct messages and
 * notifications alike, distinguished by `event.type`. Reconnects on drop.
 * Purely a "don't make me reload the tab" nicety — anything missed while
 * disconnected still lands via the notification bell or a page reload,
 * both cookie-authenticated as normal.
 *
 * `enabled` (default true) gates the connection — pass `isAuthenticated` for
 * anything mounted where a signed-out visitor can land (e.g. AuthContext),
 * since the ticket endpoint requires a session and would otherwise retry
 * against a guaranteed 401 forever.
 */
export function useRealtimeSocket(onEvent: (event: RealtimeEvent) => void, enabled = true): void {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function connect() {
      const result = await submitJson<{ ticket: string }>('/api/v1/realtime/ticket', 'POST');
      if (stopped) return;
      if (!result.ok || !result.data) {
        reconnectTimer = setTimeout(connect, 5000);
        return;
      }
      socket = new WebSocket(`${wsBase()}/api/v1/realtime?ticket=${result.data.ticket}`);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Any type string is passed through — a consumer that doesn't
          // recognize it just never matches its own `event.type === '...'`
          // checks, so old tabs degrade gracefully when a newer backend
          // starts pushing an event type they don't know about yet.
          if (data && typeof data.type === 'string') onEventRef.current(data as RealtimeEvent);
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 3000);
      };
    }

    void connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled]);
}
