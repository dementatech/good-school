'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import {
  LayoutDashboard, FileText, GraduationCap,
  School, UserCog, Contact, CalendarDays, ShieldCheck,
  UserCircle,
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
  { href: '/admin/system/schools', label: 'Schools', icon: School },
  { href: '/admin/system/staff', label: 'Staff & Admins', icon: UserCog },
  { href: '/admin/system/students', label: 'Student Accounts', icon: GraduationCap },
  { href: '/admin/system/parents', label: 'Parents', icon: Contact },
  { href: '/admin/system/super-admins', label: 'Super Admins', icon: ShieldCheck },
];

// Own-account settings — kept out of NAV and pinned beside Sign out, since it
// is about the person signed in rather than the work they came here to do.
// Available to every role that can reach this portal: an admin locked out of
// their own password would be a strange thing to ship.
const ACCOUNT_NAV = [
  { href: '/admin/account', label: 'My Account', icon: UserCircle },
];

const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <PortalSidebar
        brandInitials="GS"
        brandLabel="Good School"
        subtitle={user?.name}
        nav={NAV}
        secondaryNav={user?.role === 'super_admin' ? { label: 'System', items: SYSTEM_NAV } : undefined}
        footerNav={ACCOUNT_NAV}
        onSignOut={() => { logout(); router.push('/auth'); }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop header strip: the sidebar has no room for the bell, and it
            must stay reachable from every page. */}
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-border bg-bg-card print:hidden">
          <NotificationBell />
        </div>

        {/* Mobile top bar: hamburger + branding + the bell; nav lives in the drawer. */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title="Good School"
              subtitle={user?.name}
              items={NAV}
              secondaryItems={user?.role === 'super_admin' ? SYSTEM_NAV : []}
              footerItems={ACCOUNT_NAV}
              onSignOut={() => { logout(); router.push('/auth'); }}
            />
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">GS</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">Good School</p>
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
