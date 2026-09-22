'use client';

import { useEffect, useRef } from 'react';
import { submitJson } from '@/lib/api/envelope';

export interface RealtimeMessageEvent {
  type: 'message';
  conversationId: string;
  message: { id: string; senderUserId: string; body: string; createdAt: string };
}

function wsBase(): string {
  const httpBase = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
  return httpBase.replace(/^http/, 'ws');
}

/**
 * Opens a WebSocket straight to the backend (not through the Next.js rewrite
 * proxy, which only carries plain HTTP — see next.config.ts and the backend's
 * domain/realtime.ts) for instant delivery into an open conversation thread.
 * Reconnects on drop. Purely a "don't make me reopen the tab" nicety — a
 * message missed while disconnected still lands via the notification bell,
 * which is cookie-authenticated as normal.
 */
export function useConversationSocket(onMessage: (event: RealtimeMessageEvent) => void): void {
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function connect() {
      const result = await submitJson<{ ticket: string }>('/api/v1/communications/realtime/ticket', 'POST');
      if (stopped) return;
      if (!result.ok || !result.data) {
        reconnectTimer = setTimeout(connect, 5000);
        return;
      }
      socket = new WebSocket(`${wsBase()}/api/v1/communications/realtime?ticket=${result.data.ticket}`);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'message') onMessageRef.current(data as RealtimeMessageEvent);
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
  }, []);
}
