'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';

/**
 * Total unread chat messages across every room this user is in (muted rooms
 * excluded): the Communication nav item's badge. Refreshes on any realtime
 * chat event, with a 60-second poll as a cheap fallback.
 */
export function useUnreadMessageCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/communications/unread-count', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCount(data.data.count);
    } catch {
      // Silent: a badge failing to update must never interrupt the page.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useRealtimeSocket((event) => {
    if (event.type === 'chat_message' || event.type === 'chat_read' || event.type === 'chat_room_updated') void load();
  });

  return count;
}
