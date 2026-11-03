'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, Building2, GraduationCap, UserRound, Users } from 'lucide-react';
import { Progress } from '@/components/kit/progress';
import { ClassBarChart, type ClassBar } from '@/components/dashboard/BarChart';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardColumns, DashboardPage } from '@/components/dashboard/DashboardPage';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { Panel } from '@/components/dashboard/Panel';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { fetchOne } from '@/lib/api/envelope';
import { shortClassLabel } from '@/lib/dashboard/role-data';

interface Stats {
  schools: number;
  staff: number;
  students: number;
  parents: number;
}

interface Analytics {
  gender: { gender: 'male' | 'female' | 'unspecified'; count: number }[];
  population: { label: string; count: number }[];
  activity: { type: 'enrollment' | 'submission'; label: string; timestamp: string }[];
}

const GENDER_LABELS = { male: 'Boys', female: 'Girls', unspecified: 'Not recorded' };

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [statRows, analyticRows] = await Promise.all([
        fetchOne<Stats>('/api/v1/admin/system/stats'),
        fetchOne<Analytics>('/api/v1/admin/system/analytics'),
      ]);
      setStats(statRows);
      setAnalytics(analyticRows);
      setLoading(false);
    })();
  }, []);

  const bars = useMemo<ClassBar[]>(
    () =>
      (analytics?.population ?? []).map((row) => ({
        id: row.label,
        label: shortClassLabel(row.label),
        name: row.label,
        value: row.count,
        details: [{ label: 'Students', value: row.count.toLocaleString('en-GB') }],
      })),
    [analytics],
  );
  const gender = analytics?.gender ?? [];
  const genderTotal = gender.reduce((sum, row) => sum + row.count, 0);
  const count = (value?: number) => (value ?? 0).toLocaleString('en-GB');

  return (
    <DashboardPage>
      <MetricGrid>
        <MetricCard icon={Building2} label="Schools" value={count(stats?.schools)} href="/admin/system/schools" loading={loading} />
        <MetricCard icon={Users} label="Staff" value={count(stats?.staff)} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={GraduationCap} label="Students" value={count(stats?.students)} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={UserRound} label="Parents" value={count(stats?.parents)} href="/admin/system/accounts" loading={loading} />
      </MetricGrid>

      <DashboardColumns
        left={
          <>
            <Panel icon={Users} title="Students by gender" description="Across every school" loading={loading} empty={genderTotal === 0 ? 'No students yet.' : undefined}>
              <ul className="space-y-3">
                {gender.map((row) => (
                  <li key={row.gender} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">{GENDER_LABELS[row.gender]}</span>
                      <span className="font-semibold text-primary-900 tabular-nums">{row.count.toLocaleString('en-GB')}</span>
                    </div>
                    <Progress value={(row.count / genderTotal) * 100} aria-label={GENDER_LABELS[row.gender]} className="h-1.5" />
                  </li>
                ))}
              </ul>
            </Panel>
            <ComingUpPanel />
          </>
        }
        right={
          <>
            <Panel icon={BarChart3} title="Students by class" description="Across every school" loading={loading} empty={bars.length === 0 ? 'No students enrolled yet.' : undefined}>
              <ClassBarChart bars={bars} ariaLabel="Students in each class" />
            </Panel>
            <Panel icon={Activity} title="Recent activity" description="Enrolments and marks" loading={loading}>
              <ActivityFeed items={analytics?.activity ?? []} />
            </Panel>
          </>
        }
      />
    </DashboardPage>
  );
}
