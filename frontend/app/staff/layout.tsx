'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { AccountMenu } from '@/components/ui/AccountMenu';
import { TopbarSearch } from '@/components/ui/TopbarSearch';
import { MobileNavDrawer } from '@/components/ui/MobileNavDrawer';
import { PortalSidebar } from '@/components/ui/PortalSidebar';
import { useUnreadMessageCount } from '@/lib/communications/useUnreadMessageCount';
import {
  LayoutDashboard,
  FileText,
  UserCircle,
  ClipboardList,
  MessageSquare,
  Baby,
  CalendarRange,
  ClipboardCheck,
  NotebookPen,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';
import { subjectPhasesOf, usesNurseryRatings, useSchoolLevels } from '@/lib/levels';

// 'teacher' is the role real accounts actually get (see portals.ts); 'staff'
// is kept in case it's ever assigned, but nothing currently creates one.
const STAFF_ROLES: Role[] = ['staff', 'teacher'];

const NAV_BASE = [
  { href: '/staff', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  {
    href: '/staff/forms',
    label: 'Data Forms',
    short: 'Forms',
    icon: FileText,
    activePrefixes: ['/staff/forms', '/staff/lessons', '/staff/attendance', '/staff/practical', '/staff/behaviour'],
  },
  { href: '/staff/timetable', label: 'My Timetable', icon: CalendarRange },
  { href: '/staff/attendance', label: 'Class Register', icon: ClipboardCheck },
  { href: '/staff/lessons', label: 'Lesson Preparation', icon: NotebookPen },
  { href: '/staff/exam-marks', label: 'Exam Marks', icon: ClipboardList },
  { href: '/staff/kindergarten', label: 'Kindergarten Progress', icon: Baby },
  { href: '/staff/communications', label: 'Communication', icon: MessageSquare },
];

// Own-account settings — reached via the topbar's AccountMenu on desktop;
// mobile still lists it in the drawer's footer, beside Sign out.
const ACCOUNT_NAV = [
  { href: '/staff/account', label: 'My Account', icon: UserCircle },
];

function StaffShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const unreadMessages = useUnreadMessageCount();
  // Teachers aren't section-scoped: they can teach in Nursery and Primary alike.
  const levels = useSchoolLevels({ scoped: false });
  const NAV = React.useMemo(
    () =>
      NAV_BASE.filter(
        (item) =>
          (item.href !== '/staff/kindergarten' || usesNurseryRatings(levels)) &&
          // Exam marks only where the school gives marks.
          (item.href !== '/staff/exam-marks' || subjectPhasesOf(levels).length > 0),
      ).map((item) =>
        item.href === '/staff/communications' ? { ...item, badge: unreadMessages } : item,
      ),
    [unreadMessages, levels],
  );

  return (
    <div className="min-h-screen bg-bg-canvas flex">
      <PortalSidebar
        brandLogoUrl={user?.logoUrl}
        brandLabel={user?.school || 'Good School'}
        subtitle={user?.name}
        nav={NAV}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-between gap-4 px-8 py-2 border-b border-border bg-bg-card">
          <TopbarSearch items={NAV} />
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <AccountMenu accountHref="/staff/account" onSignOut={() => { logout(); router.push('/auth'); }} />
          </div>
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title={user?.school || 'Good School'}
              subtitle={user?.name}
              items={NAV}
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
        <main className="flex-1 p-3 sm:p-6 md:p-8"><FeatureGate>{children}</FeatureGate></main>
      </div>
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={STAFF_ROLES}>
      <SchoolThemeApplier />
      <StaffShell>{children}</StaffShell>
    </PortalGate>
  );
}
