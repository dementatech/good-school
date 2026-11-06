'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import React from 'react';
import { LayoutDashboard, Award, LifeBuoy, MessageSquare } from 'lucide-react';
import { useUnreadMessageCount } from '@/lib/communications/useUnreadMessageCount';

/**
 * Shell for the "browsing" student screens only (dashboard, assessment list)
 * — deliberately NOT wrapped around take/[id] or paper/[id], which are
 * full-bleed, focused task screens where a persistent nav sidebar would be a
 * way to wander off mid-assessment. See app/student/(protected)/layout.tsx
 * for the PortalGate that still covers every student route, this one included.
 */
const NAV = [
  { href: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/student/results', label: 'My Results', icon: Award },
  { href: '/student/communications', label: 'Messages', icon: MessageSquare },
  { href: '/student/support', label: 'Help & Support', icon: LifeBuoy },
];

export default function StudentDashboardLayout({ children }: { children: React.ReactNode }) {
  const unread = useUnreadMessageCount();
  const nav = React.useMemo(
    () => NAV.map((item) => (item.href === '/student/communications' ? { ...item, badge: unread } : item)),
    [unread],
  );

  return (
    <PortalShell nav={nav} dashboardHref="/student/dashboard">
      {children}
    </PortalShell>
  );
}
