'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import { Select } from '@/components/ui/Select';
import { ParentChildrenProvider, useParentChildren } from '@/components/parent/ParentChildrenContext';
import { LayoutDashboard, Award, ClipboardCheck, BookOpen, Bell } from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const PARENT_ROLES: Role[] = ['parent'];

const NAV = [
  { href: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/parent/results', label: 'Results', icon: Award },
  { href: '/parent/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/parent/lessons', label: 'Lessons', icon: BookOpen },
  { href: '/parent/notifications', label: 'Notifications', icon: Bell },
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
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <PortalSidebar
        brandInitials="GS"
        brandLabel="Good School"
        subtitle={user?.name}
        nav={NAV}
        onSignOut={() => { logout(); router.push('/auth'); }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-3 px-8 py-2 border-b border-border bg-bg-card">
          <ChildSwitcher />
          <NotificationBell />
        </div>

        <div className="md:hidden flex flex-col gap-2 px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <MobileNavDrawer
                title="Good School"
                subtitle={user?.name}
                items={NAV}
                onSignOut={() => { logout(); router.push('/auth'); }}
              />
              <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">GS</span>
              </div>
              <p className="text-sm font-semibold text-primary-900 truncate">Good School</p>
            </div>
            <NotificationBell />
          </div>
          <ChildSwitcher />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8"><FeatureGate>{nodes}</FeatureGate></main>
      </div>
    </div>
  );
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={PARENT_ROLES}>
      <Suspense fallback={null}>
        <ParentChildrenProvider>
          <ParentShell>{children}</ParentShell>
        </ParentChildrenProvider>
      </Suspense>
    </PortalGate>
  );
}
