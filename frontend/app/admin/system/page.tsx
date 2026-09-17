'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { School, UserCog, Library, ShieldCheck } from 'lucide-react';

interface Stats {
  schools: number;
  schoolAdmins: number;
  staff: number;
  students: number;
  parents: number;
  superAdmins: number;
  libraryPending: number;
}

// Strictly 4: the account breakdown (students/parents) already lives on the
// main /admin dashboard — this page stays focused on what's unique to
// system administration (school count, school-admin count, staff, approvals).
const CARDS = [
  { key: 'schools' as const, label: 'Schools', href: '/admin/system/schools', icon: School },
  { key: 'schoolAdmins' as const, label: 'School Admins', href: '/admin/system/accounts', icon: ShieldCheck },
  { key: 'staff' as const, label: 'Staff', href: '/admin/system/accounts', icon: UserCog },
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
    <DashboardShell>
      <WelcomeBanner subtitle="Schools, curriculum and every account. Super admin only." />

      <DashboardGrid>
        {CARDS.map((c, i) => (
          <StatCard
            key={c.label}
            icon={c.icon}
            label={c.label}
            href={c.href}
            value={stats[c.key]}
            loading={loading}
            accent={i === 0 ? 'hero' : 'neutral'}
          />
        ))}
      </DashboardGrid>
    </DashboardShell>
  );
}
