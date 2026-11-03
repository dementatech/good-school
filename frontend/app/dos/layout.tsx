'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import React from 'react';
import Link from 'next/link';
import '@/lib/dosFetch';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
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
  TrendingUp,
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
      { href: '/dos/exam-performance', label: 'Exam Performance', icon: TrendingUp },
      { href: '/dos/grading-schemes', label: 'Grading Schemes', icon: Award },
      { href: '/dos/kindergarten', label: 'Kindergarten Progress', icon: Baby },
    ],
  },
  { href: '/dos/support', label: 'Help & Support', icon: LifeBuoy },
  { href: '/staff', label: 'My teacher portal', icon: ArrowLeftRight },
];

function DosShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const levels = useSchoolLevels();
  const dos = useDirectorOfStudies();

  const NAV = React.useMemo(() => {
    // Same level rules as the school admin's menu.
    const hasMarks = subjectPhasesOf(levels).length > 0;
    const hidden = new Set<string>([
      ...(usesNurseryRatings(levels) ? [] : ['/dos/kindergarten']),
      ...(levels?.offersOLevel ? [] : ['/dos/subjects/options']),
      ...(levels?.offersALevel ? [] : ['/dos/subjects/combinations']),
      ...(hasMarks ? [] : ['/dos/exams', '/dos/report-card-studio', '/dos/exam-performance', '/dos/grading-schemes']),
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

  return (
    <PortalShell nav={NAV} dashboardHref="/dos" subtitle={`${user?.name ?? ''} · Director of Studies`} showSectionSwitcher>
      {children}
    </PortalShell>
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
