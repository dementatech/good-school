'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import React, { Suspense } from 'react';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
import { Select } from '@/components/ui/Select';
import { ParentChildrenProvider, useParentChildren } from '@/components/parent/ParentChildrenContext';
import { LayoutDashboard, Award, ClipboardCheck, BookOpen, Bell, LifeBuoy, MessageSquare } from 'lucide-react';
import { useUnreadMessageCount } from '@/lib/communications/useUnreadMessageCount';
import type { Role } from '@/lib/auth/session';

const PARENT_ROLES: Role[] = ['parent'];

const NAV = [
  { href: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/parent/results', label: 'Results', icon: Award },
  { href: '/parent/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/parent/lessons', label: 'Lessons', icon: BookOpen },
  { href: '/parent/communications', label: 'Messages', icon: MessageSquare },
  { href: '/parent/notifications', label: 'Notifications', icon: Bell },
  { href: '/parent/support', label: 'Help & Support', icon: LifeBuoy },
];

function ChildSwitcher() {
  const { children, loading, selectedId, selectChild } = useParentChildren();
  if (loading || children.length <= 1) return null;
  return (
    <div className="w-48">
      <Select
        aria-label="Choose a child"
        options={children.map((c) => ({ value: c.id, label: c.name }))}
        value={selectedId ?? ''}
        onChange={(e) => selectChild(e.target.value)}
      />
    </div>
  );
}

function ParentShell({ children: nodes }: { children: React.ReactNode }) {
  const unread = useUnreadMessageCount();
  const nav = React.useMemo(
    () => NAV.map((item) => (item.href === '/parent/communications' ? { ...item, badge: unread } : item)),
    [unread],
  );

  return (
    <PortalShell nav={nav} dashboardHref="/parent/dashboard" topbarAction={<ChildSwitcher />}>
      {nodes}
    </PortalShell>
  );
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={PARENT_ROLES}>
      <SchoolThemeApplier />
      <Suspense fallback={null}>
        <ParentChildrenProvider>
          <ParentShell>{children}</ParentShell>
        </ParentChildrenProvider>
      </Suspense>
    </PortalGate>
  );
}
