'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { TopbarSearch } from '@/components/ui/TopbarSearch';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import {
  LayoutDashboard, FileText,
  School, Users, CalendarDays,
  ClipboardList, CalendarClock,
  UserCircle,
  LifeBuoy, Inbox,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

// The old /admin/students and /admin/users roster pages are gone: they were the
// pre-Supabase-Auth surface, built on the dropped `students`/`users` tables and
// a hardcoded school list. Their replacements are under System below.
const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/lessons', label: 'Lesson Submissions', icon: FileText },
];

// Super-admin-only account provisioning — separate from the day-to-day
// roster pages above (route-level guarded by requireSuperAdmin too, this is
// just nav visibility).
const SYSTEM_NAV = [
  { href: '/admin/system/curriculum', label: 'Curriculum & Subjects', icon: CalendarDays },
  { href: '/admin/system/exams', label: 'Exam Sessions', icon: ClipboardList },
  { href: '/admin/system/events', label: 'Global Events', icon: CalendarClock },
  { href: '/admin/system/schools', label: 'Schools', icon: School },
  { href: '/admin/system/accounts', label: 'Accounts', icon: Users },
];

// Own-account settings — kept out of NAV and pinned beside Sign out, since it
// is about the person signed in rather than the work they came here to do.
// Available to every role that can reach this portal: an admin locked out of
// their own password would be a strange thing to ship.
// Reporting a problem is for everyone but the platform owner — they're who
// reports land with, in the Support Inbox under System.
const SUPPORT_NAV = { href: '/admin/support', label: 'Help & Support', icon: LifeBuoy };
const INBOX_NAV = { href: '/admin/system/support', label: 'Support Inbox', icon: Inbox };

const ACCOUNT_NAV = [
  { href: '/admin/account', label: 'My Account', icon: UserCircle },
];

const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const nav = user?.isPlatformOwner ? NAV : [...NAV, SUPPORT_NAV];
  const systemNav =
    user?.role !== 'super_admin' ? [] : user.isPlatformOwner ? [INBOX_NAV, ...SYSTEM_NAV] : SYSTEM_NAV;

  return (
    <div className="min-h-screen bg-bg-canvas flex">
      <PortalSidebar
        brandLogoUrl={user?.logoUrl}
        brandLabel={user?.school || 'Good School'}
        subtitle={user?.name}
        nav={nav}
        secondaryNav={systemNav.length ? { label: 'System', items: systemNav } : undefined}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop header strip: the sidebar has no room for the bell or
            account menu, and both must stay reachable from every page. */}
        <div className="hidden md:flex items-center justify-between gap-4 px-8 py-2 border-b border-border bg-bg-card print:hidden">
          <TopbarSearch items={[...nav, ...systemNav]} />
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <AccountMenu accountHref="/admin/account" onSignOut={() => { logout(); router.push('/auth'); }} />
          </div>
        </div>

        {/* Mobile top bar: hamburger + branding + the bell; nav lives in the drawer. */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title={user?.school || 'Good School'}
              subtitle={user?.name}
              items={nav}
              secondaryItems={systemNav}
              footerItems={ACCOUNT_NAV}
              onSignOut={() => { logout(); router.push('/auth'); }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user?.logoUrl || '/logo.png'}
              alt=""
              className="w-8 h-8 rounded-lg object-contain bg-white border border-[#EAEAEA] shrink-0"
            />
            <p className="text-sm font-semibold text-primary-900 truncate">{user?.school || 'Good School'}</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8 print:p-0"><FeatureGate>{children}</FeatureGate></main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={ADMIN_ROLES}>
      <AdminShell>{children}</AdminShell>
    </PortalGate>
  );
}
