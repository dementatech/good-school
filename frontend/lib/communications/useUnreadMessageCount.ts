'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';

/**
 * Total unread direct messages across every conversation this user (a
 * school_admin or teacher) is part of — feeds the Communication nav item's
 * sidebar badge. Refreshes instantly on a realtime `message` push, with a
 * 60-second poll as a cheap fallback.
 */
export function useUnreadMessageCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/communications/unread-count');
      const data = await res.json();
      if (data.success) setCount(data.data.count);
    } catch {
      // Silent — a badge failing to update must never interrupt the page.
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
    if (event.type === 'message') void load();
  });

  return count;
}
