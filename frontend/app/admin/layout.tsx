'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import { useAuth } from '@/components/auth/AuthContext';
import React from 'react';
import { PortalGate } from '@/components/auth/PortalGate';
import {
  LayoutDashboard, FileText,
  School, Users, CalendarDays,
  ClipboardList, CalendarClock,
  UserCircle,
  LifeBuoy, Inbox, Library,
  MessageSquare,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';
import { useUnreadMessageCount } from '@/lib/communications/useUnreadMessageCount';

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
  { href: '/admin/system/library', label: 'Library Approvals', icon: Library },
];

// Own-account settings — kept out of NAV and pinned beside Sign out, since it
// is about the person signed in rather than the work they came here to do.
// Available to every role that can reach this portal: an admin locked out of
// their own password would be a strange thing to ship.
// Reporting a problem is for everyone but the platform owner — they're who
// reports land with, in the Support Inbox under System. Support agents work
// that inbox too, but can still report to the owner.
const SUPPORT_NAV = { href: '/admin/support', label: 'Help & Support', icon: LifeBuoy };
const INBOX_NAV = { href: '/admin/system/support', label: 'Support Inbox', icon: Inbox };
// Live chat with each school's admins; the support team only.
const CHAT_NAV = { href: '/admin/communications', label: 'School Chats', icon: MessageSquare };

const ACCOUNT_NAV = [
  { href: '/admin/account', label: 'My Account', icon: UserCircle },
];

const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supportTeam = user?.role === 'super_admin' && Boolean(user.isPlatformOwner || user.isSupportAgent);
  const unread = useUnreadMessageCount(supportTeam);
  const nav = [
    ...NAV,
    ...(supportTeam ? [{ ...CHAT_NAV, badge: unread }] : []),
    ...(user?.isPlatformOwner ? [] : [SUPPORT_NAV]),
  ];
  const systemNav =
    user?.role !== 'super_admin'
      ? []
      : user.isPlatformOwner || user.isSupportAgent
        ? [INBOX_NAV, ...SYSTEM_NAV]
        : SYSTEM_NAV;

  return (
    <PortalShell
      nav={nav}
      dashboardHref="/admin"
      secondaryNav={systemNav.length ? { label: 'System', items: systemNav } : undefined}
      accountHref="/admin/account"
      footerItems={ACCOUNT_NAV}
    >
      {children}
    </PortalShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={ADMIN_ROLES}>
      <AdminShell>{children}</AdminShell>
    </PortalGate>
  );
}
