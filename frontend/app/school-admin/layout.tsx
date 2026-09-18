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
} from 'lucide-react';
import type { Role } from '@/lib/auth/session';

const SCHOOL_ADMIN_ROLES: Role[] = ['school_admin'];

const NAV = [
  { href: '/school-admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/school-admin/academic-years', label: 'Academic Years', icon: CalendarDays },
  { href: '/school-admin/classes', label: 'Classes & Streams', icon: Layers },
  {
    label: 'Curriculum & Subjects',
    icon: BookOpen,
    children: [
      { href: '/school-admin/subjects', label: 'Manage Subjects', icon: BookOpen, exact: true },
      { href: '/school-admin/subjects/options', label: 'Manage Options', icon: ListChecks },
      { href: '/school-admin/subjects/combinations', label: 'Combinations', icon: Combine },
    ],
  },
  { href: '/school-admin/staff', label: 'Staff', icon: UserCog },
  { href: '/school-admin/organisation-studio', label: 'Organisation Studio', icon: Network },
  { href: '/school-admin/students', label: 'Students', icon: GraduationCap },
  {
    label: 'Exams',
    icon: ClipboardList,
    children: [
      { href: '/school-admin/exams', label: 'Manage Exams', icon: ClipboardList, exact: true },
      { href: '/school-admin/report-card-studio', label: 'Report Card Studio', icon: FileBarChart2 },
      { href: '/school-admin/grading-schemes', label: 'Grading Schemes', icon: Award },
    ],
  },
  { href: '/school-admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/school-admin/lessons', label: 'Lessons', icon: NotebookPen },
  { href: '/school-admin/events', label: 'Events', icon: CalendarClock },
  { href: '/school-admin/terms', label: 'Terms', icon: CalendarDays },
  { href: '/school-admin/school', label: 'My School', icon: School },
];

function SchoolAdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

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
          <TopbarSearch items={NAV} />
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
