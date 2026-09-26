'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '@/lib/dosFetch';
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
import { Card } from '@/components/ui/Card';
import { PageLoader } from '@/components/ui/loader';
import { useDirectorOfStudies } from '@/lib/portal';
import { subjectPhasesOf, usesNurseryRatings, useSchoolLevels } from '@/lib/levels';
import type { Role } from '@/lib/auth/session';
import {
  ArrowLeftRight,
  Award,
  Baby,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Combine,
  FileBarChart2,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  LifeBuoy,
} from 'lucide-react';

// The Director of Studies signs in with their teacher account ('teacher' from
// the backend, which the client calls 'staff' — see lib/auth/roles-map.ts).
const DOS_ROLES: Role[] = ['staff', 'teacher'];

const NAV_BASE = [
  { href: '/dos', label: 'Overview', icon: LayoutDashboard, exact: true },
  {
    label: 'Academics',
    icon: BookOpen,
    children: [
      { href: '/dos/lessons', label: 'Lesson Preparation', icon: NotebookPen },
      { href: '/dos/timetable', label: 'Timetable', icon: CalendarRange },
      { href: '/dos/attendance', label: 'Attendance', icon: ClipboardCheck },
      { href: '/dos/classes', label: 'Classes & Streams', icon: Layers },
      { href: '/dos/subjects', label: 'Subjects', icon: BookOpen, exact: true },
      { href: '/dos/subjects/options', label: 'Subject Options', icon: ListChecks },
      { href: '/dos/subjects/combinations', label: 'Combinations', icon: Combine },
    ],
  },
  {
    label: 'Exams & Reports',
    icon: ClipboardList,
    children: [
      { href: '/dos/exams', label: 'Manage Exams', icon: ClipboardList, exact: true },
      { href: '/dos/report-card-studio', label: 'Report Card Studio', icon: FileBarChart2 },
      { href: '/dos/grading-schemes', label: 'Grading Schemes', icon: Award },
      { href: '/dos/kindergarten', label: 'Kindergarten Progress', icon: Baby },
    ],
  },
  { href: '/dos/support', label: 'Help & Support', icon: LifeBuoy },
  { href: '/staff', label: 'My teacher portal', icon: ArrowLeftRight },
];

function DosShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const levels = useSchoolLevels();
  const dos = useDirectorOfStudies();

  const NAV = React.useMemo(() => {
    // Same level rules as the school admin's menu.
    const hasMarks = subjectPhasesOf(levels).length > 0;
    const hidden = new Set<string>([
      ...(usesNurseryRatings(levels) ? [] : ['/dos/kindergarten']),
      ...(levels?.offersOLevel ? [] : ['/dos/subjects/options']),
      ...(levels?.offersALevel ? [] : ['/dos/subjects/combinations']),
      ...(hasMarks ? [] : ['/dos/exams', '/dos/report-card-studio', '/dos/grading-schemes']),
    ]);
    return NAV_BASE.filter((item) => !item.href || !hidden.has(item.href))
      .map((item) =>
        'children' in item && item.children
          ? { ...item, children: item.children.filter((c) => !hidden.has(c.href)) }
          : item,
      )
      .filter((item) => !('children' in item && item.children) || item.children.length > 0);
  }, [levels]);

  if (!dos) return <PageLoader />;
  if (!dos.isDos) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bg-canvas">
        <Card className="max-w-md text-center space-y-3">
          <GraduationCap className="w-8 h-8 mx-auto text-primary-700" aria-hidden />
          <p className="text-sm text-text-muted">
            This is the Director of Studies&apos; portal. You&apos;ll see it once the school assigns you the academic
            head&apos;s position in Organisation Studio.
          </p>
          <Link href="/staff" className="text-sm font-medium text-primary-700 hover:underline">
            Back to your teacher portal
          </Link>
        </Card>
      </div>
    );
  }

  const signOut = () => {
    logout();
    router.push('/auth');
  };

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white flex">
      <div className="print:!hidden contents">
        <PortalSidebar
          brandLogoUrl={user?.logoUrl}
          brandLabel={user?.school || 'Good School'}
          subtitle={`${user?.name ?? ''} · Director of Studies`}
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
            <AccountMenu onSignOut={signOut} />
          </div>
        </div>

        <div className="md:hidden print:!hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title={user?.school || 'Good School'}
              subtitle="Director of Studies"
              items={NAV}
              onSignOut={signOut}
            />
            <p className="text-sm font-semibold text-primary-900 truncate">{user?.school || 'Good School'}</p>
          </div>
          <NotificationBell />
        </div>
        <div className="md:hidden print:!hidden flex justify-center px-4 py-2 border-b border-border bg-bg-card empty:hidden">
          <SectionSwitcher compact />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8 print:p-0">
          <FeatureGate>{children}</FeatureGate>
        </main>
      </div>
    </div>
  );
}

/** The Director of Studies' portal: the school's academic work — lesson
 * preparation, timetables, attendance, exams and report cards, subjects and
 * curriculum — for the teacher holding the academic head's position. */
export default function DosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalGate roles={DOS_ROLES}>
      <SchoolThemeApplier />
      <DosShell>{children}</DosShell>
    </PortalGate>
  );
}
