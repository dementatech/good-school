'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { PortalGate } from '@/components/auth/PortalGate';
import { SchoolThemeApplier } from '@/components/theme/SchoolThemeApplier';
import { FeatureGate } from '@/components/FeatureGate';
import { NotificationBell } from '@/components/ui/NotificationBell';
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
  NotebookPen,
  BookOpen,
  Network,
  ListChecks,
  Combine,
  Award,
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
      { href: '/school-admin/grading-schemes', label: 'Grading Schemes', icon: Award },
    ],
  },
  { href: '/school-admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/school-admin/lessons', label: 'Lessons', icon: NotebookPen },
  { href: '/school-admin/terms', label: 'Terms', icon: CalendarDays },
  { href: '/school-admin/school', label: 'My School', icon: School },
];

function SchoolAdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-bg flex">
      <PortalSidebar
        brandInitials="GS"
        brandLabel="Good School"
        subtitle={user?.name}
        nav={NAV}
        onSignOut={() => { logout(); router.push('/auth'); }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-2 px-8 py-2 border-b border-border bg-bg-card">
          <NotificationBell />
        </div>

        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <MobileNavDrawer
              title="Good School"
              subtitle={user?.name}
              items={NAV}
              onSignOut={() => { logout(); router.push('/auth'); }}
            />
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">GS</span>
            </div>
            <p className="text-sm font-semibold text-primary-900 truncate">Good School</p>
          </div>
          <NotificationBell />
        </div>
        <main className="flex-1 p-3 sm:p-6 md:p-8"><FeatureGate>{children}</FeatureGate></main>
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
