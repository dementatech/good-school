'use client';

import { useEffect, useState } from 'react';
import { Library, School, ShieldCheck, UserCog } from 'lucide-react';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { fetchList, fetchOne } from '@/lib/api/envelope';

interface AccountSummary {
  schoolAdmins: number;
  staff: number;
}

/** What's unique to running the platform; the people totals are on /admin. */
export default function SystemDashboard() {
  const [schools, setSchools] = useState(0);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [schoolRows, accounts, library] = await Promise.all([
        fetchList('/api/v1/schools'),
        fetchOne<AccountSummary>('/api/v1/admin/accounts/summary'),
        fetchList('/api/v1/library/content?scope=pending'),
      ]);
      setSchools(schoolRows.length);
      setSummary(accounts);
      setPending(library.length);
      setLoading(false);
    })();
  }, []);

  return (
    <DashboardPage title="System overview">
      <MetricGrid>
        <MetricCard icon={School} label="Schools" value={schools} href="/admin/system/schools" loading={loading} />
        <MetricCard icon={ShieldCheck} label="School admins" value={summary?.schoolAdmins ?? 0} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={UserCog} label="Staff" value={summary?.staff ?? 0} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={Library} label="Library approvals pending" value={pending} href="/admin/system/library" loading={loading} />
      </MetricGrid>
    </DashboardPage>
  );
}
