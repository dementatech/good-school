'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import { LayoutDashboard, FileText, UserCircle } from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const STAFF_ROLES: Role[] = ['staff'];

const NAV = [
  { href: '/staff', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  {
    href: '/staff/forms',
    label: 'Data Forms',
    short: 'Forms',
    icon: FileText,
    activePrefixes: ['/staff/forms', '/staff/lessons', '/staff/attendance', '/staff/practical', '/staff/behaviour'],
  },
  { href: '/staff/account', label: 'My Account', icon: UserCircle },
];

function StaffShell({ children }: { children: React.ReactNode }) {
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
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-border bg-bg-card">
          <NotificationBell />
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
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
        <main className="flex-1 p-3 sm:p-6 md:p-8"><FeatureGate>{children}</FeatureGate></main>
      </div>
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={STAFF_ROLES}>
      <StaffShell>{children}</StaffShell>
    </PortalGate>
  );
}
