'use client';

import { PortalShell } from '@/components/dashboard/PortalShell';
import React from 'react';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
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
  TrendingUp,
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
      { href: '/school-admin/exam-performance', label: 'Exam Performance', icon: TrendingUp },
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
      ...(hasMarks ? [] : ['/school-admin/exams', '/school-admin/report-card-studio', '/school-admin/report-card-layout', '/school-admin/exam-performance', '/school-admin/grading-schemes']),
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
    <PortalShell nav={NAV} dashboardHref="/school-admin" showSectionSwitcher>
      {children}
    </PortalShell>
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
