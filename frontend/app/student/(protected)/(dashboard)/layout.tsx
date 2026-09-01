'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import { FeatureGate } from '@/components/FeatureGate';
import { LayoutDashboard, Award } from 'lucide-react';

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
];

export default function StudentDashboardLayout({ children }: { children: React.ReactNode }) {
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
