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
import { SectionSwitcher } from '@/components/ui/SectionSwitcher';
import { useUnreadMessageCount } from '@/lib/communications/useUnreadMessageCount';
import {
  LayoutDashboard,
  Layers,
  UserCog,
  GraduationCap,
  ClipboardCheck,
  ClipboardList,
  School,
  CalendarDays,
  CalendarClock,
  NotebookPen,
  BookOpen,
  Network,
  ListChecks,
  Combine,
  Award,
  FileBarChart2,
  MessageSquare,
  Baby,
  CalendarRange,
  Users,
  LayoutTemplate,
  LifeBuoy,
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';
import { subjectPhasesOf, usesNurseryRatings, useSchoolLevels } from '@/lib/levels';

const SCHOOL_ADMIN_ROLES: Role[] = ['school_admin'];

// Grouped so the menu fits: day-to-day academic work under Academics, results
// under Exams & Reports, people under People. Top-level entries stay for what
// isn't part of a family (Communication carries its unread badge).
const NAV_BASE = [
  { href: '/school-admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  {
    label: 'Academics',
    icon: BookOpen,
    children: [
      { href: '/school-admin/academic-years', label: 'Academic Years', icon: CalendarDays },
      { href: '/school-admin/terms', label: 'Terms', icon: CalendarDays },
      { href: '/school-admin/classes', label: 'Classes & Streams', icon: Layers },
      { href: '/school-admin/subjects', label: 'Subjects', icon: BookOpen, exact: true },
      { href: '/school-admin/subjects/options', label: 'Subject Options', icon: ListChecks },
      { href: '/school-admin/subjects/combinations', label: 'Combinations', icon: Combine },
      { href: '/school-admin/timetable', label: 'Timetable', icon: CalendarRange },
      { href: '/school-admin/lessons', label: 'Lesson Preparation', icon: NotebookPen },
      { href: '/school-admin/attendance', label: 'Attendance', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Exams & Reports',
    icon: ClipboardList,
    children: [
      { href: '/school-admin/exams', label: 'Manage Exams', icon: ClipboardList, exact: true },
      { href: '/school-admin/report-card-studio', label: 'Report Card Studio', icon: FileBarChart2 },
      { href: '/school-admin/report-card-layout', label: 'Report Card Layout', icon: LayoutTemplate },
      { href: '/school-admin/grading-schemes', label: 'Grading Schemes', icon: Award },
      { href: '/school-admin/kindergarten', label: 'Kindergarten Progress', icon: Baby },
    ],
  },
  {
    label: 'People',
    icon: Users,
    children: [
      { href: '/school-admin/students', label: 'Students', icon: GraduationCap },
      { href: '/school-admin/staff', label: 'Staff', icon: UserCog },
      { href: '/school-admin/organisation-studio', label: 'Organisation Studio', icon: Network },
    ],
  },
  { href: '/school-admin/communications', label: 'Communication', icon: MessageSquare },
  { href: '/school-admin/events', label: 'Events', icon: CalendarClock },
  { href: '/school-admin/school', label: 'My School', icon: School },
  { href: '/school-admin/support', label: 'Help & Support', icon: LifeBuoy },
];

function SchoolAdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const unreadMessages = useUnreadMessageCount();
  const levels = useSchoolLevels();
  const NAV = React.useMemo(() => {
    // Hide pages for levels this school doesn't run — and every level-specific
    // page until its levels are known, so nothing flashes up for the wrong school.
    // Exams and grading exist only where there are marks — a Nursery on
    // progress ratings has none. Subjects always shows: in a ratings-only
    // Nursery it's where the school turns marks on.
    const hasMarks = subjectPhasesOf(levels).length > 0;
    const hidden = new Set<string>([
      ...(usesNurseryRatings(levels) ? [] : ['/school-admin/kindergarten']),
      ...(levels?.offersOLevel ? [] : ['/school-admin/subjects/options']),
      ...(levels?.offersALevel ? [] : ['/school-admin/subjects/combinations']),
      ...(levels ? [] : ['/school-admin/subjects']),
      ...(hasMarks ? [] : ['/school-admin/exams', '/school-admin/report-card-studio', '/school-admin/report-card-layout', '/school-admin/grading-schemes']),
    ]);
    return NAV_BASE.filter((item) => !item.href || !hidden.has(item.href))
      .map((item) => {
        if ('children' in item && item.children) {
          return { ...item, children: item.children.filter((c) => !hidden.has(c.href)) };
        }
        return item.href === '/school-admin/communications' ? { ...item, badge: unreadMessages } : item;
      })
      .filter((item) => !('children' in item && item.children) || item.children.length > 0);
  }, [unreadMessages, levels]);

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white flex">
      <div className="print:!hidden contents">
        <PortalSidebar
          brandLogoUrl={user?.logoUrl}
          brandLabel={user?.school || 'Good School'}
          subtitle={user?.name}
          nav={NAV}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex print:!hidden items-center justify-between gap-4 px-8 py-2 border-b border-border bg-bg-card">
          <div className="flex items-center gap-4 min-w-0">
            <TopbarSearch items={NAV} />
            <SectionSwitcher />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <AccountMenu onSignOut={() => { logout(); router.push('/auth'); }} />
          </div>
        </div>

        <div className="md:hidden print:!hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title={user?.school || 'Good School'}
              subtitle={user?.name}
              items={NAV}
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
        <div className="md:hidden print:!hidden flex justify-center px-4 py-2 border-b border-border bg-bg-card empty:hidden">
          <SectionSwitcher compact />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8 print:p-0"><FeatureGate>{children}</FeatureGate></main>
      </div>
    </div>
  );
}

export default function SchoolAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={SCHOOL_ADMIN_ROLES}>
      <SchoolThemeApplier />
      <SchoolAdminShell>{children}</SchoolAdminShell>
    </PortalGate>
  );
}
