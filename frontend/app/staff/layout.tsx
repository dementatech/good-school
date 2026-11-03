'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import React from 'react';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
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
  GraduationCap,
  LifeBuoy,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';
import { subjectPhasesOf, usesNurseryRatings, useSchoolLevels } from '@/lib/levels';
import { useDirectorOfStudies } from '@/lib/portal';

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
  { href: '/staff/support', label: 'Help & Support', icon: LifeBuoy },
];

// Own-account settings — reached via the topbar's AccountMenu on desktop;
// mobile still lists it in the drawer's footer, beside Sign out.
const ACCOUNT_NAV = [
  { href: '/staff/account', label: 'My Account', icon: UserCircle },
];

function StaffShell({ children }: { children: React.ReactNode }) {
  const unreadMessages = useUnreadMessageCount();
  // Teachers aren't section-scoped: they can teach in Nursery and Primary alike.
  const levels = useSchoolLevels({ scoped: false });
  const dos = useDirectorOfStudies();
  const NAV = React.useMemo(
    () =>
      [
        ...NAV_BASE,
        // The Director of Studies reaches their own portal from here.
        ...(dos?.isDos ? [{ href: '/dos', label: 'Director of Studies', short: 'DOS', icon: GraduationCap }] : []),
      ].filter(
        (item) =>
          (item.href !== '/staff/kindergarten' || usesNurseryRatings(levels)) &&
          // Exam marks only where the school gives marks.
          (item.href !== '/staff/exam-marks' || subjectPhasesOf(levels).length > 0),
      ).map((item) =>
        item.href === '/staff/communications' ? { ...item, badge: unreadMessages } : item,
      ),
    [unreadMessages, levels, dos?.isDos],
  );

  return (
    <PortalShell nav={NAV} dashboardHref="/staff" accountHref="/staff/account" footerItems={ACCOUNT_NAV}>
      {children}
    </PortalShell>
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
