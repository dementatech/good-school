'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { School, UserCog, GraduationCap, Contact, Library, ShieldCheck } from 'lucide-react';

interface Stats {
  schools: number;
  schoolAdmins: number;
  staff: number;
  students: number;
  parents: number;
  superAdmins: number;
  libraryPending: number;
}

const CARDS = [
  { key: 'schools' as const, label: 'Schools', href: '/admin/system/schools', icon: School },
  { key: 'schoolAdmins' as const, label: 'School Admins', href: '/admin/system/accounts', icon: ShieldCheck },
  { key: 'staff' as const, label: 'Staff', href: '/admin/system/accounts', icon: UserCog },
  { key: 'students' as const, label: 'Students', href: '/admin/system/accounts', icon: GraduationCap },
  { key: 'parents' as const, label: 'Parents', href: '/admin/system/accounts', icon: Contact },
  { key: 'libraryPending' as const, label: 'Library approvals pending', href: '/admin/system/library', icon: Library },
];

export default function SystemDashboard() {
  const [stats, setStats] = useState<Stats>({
    schools: 0,
    schoolAdmins: 0,
    staff: 0,
    students: 0,
    parents: 0,
    superAdmins: 0,
    libraryPending: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [schools, summary, library] = await Promise.all([
          fetch('/api/v1/schools', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/v1/admin/accounts/summary', { credentials: 'include' }).then((r) => r.json()),
          fetch('/api/v1/library/content?scope=pending', { credentials: 'include' }).then((r) => r.json()),
        ]);
        setStats({
          schools: schools.data?.length ?? 0,
          schoolAdmins: summary.data?.schoolAdmins ?? 0,
          staff: summary.data?.staff ?? 0,
          students: summary.data?.students ?? 0,
          parents: summary.data?.parents ?? 0,
          superAdmins: summary.data?.superAdmins ?? 0,
          libraryPending: library.data?.length ?? 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">System</h1>
      <p className="text-sm text-text-muted mb-6">Schools, curriculum and every account. Super admin only.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card hover className="p-3 sm:p-5">
                <div className="p-2 sm:p-2.5 rounded-xl bg-bg-muted w-fit mb-2 sm:mb-3">
                  <Icon className="w-5 h-5 text-primary-700" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-primary-900 tabular-nums">
                  {loading ? '—' : stats[c.key]}
                </p>
                <p className="text-sm text-text-muted mt-1">{c.label}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
