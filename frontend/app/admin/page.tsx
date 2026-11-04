'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Building2, GraduationCap, UserRound, Users } from 'lucide-react';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardColumns, DashboardFeatureRow, DashboardPage } from '@/components/dashboard/DashboardPage';
import { DonutChart, type DonutPart } from '@/components/dashboard/DonutChart';
import { FeaturePanel } from '@/components/dashboard/FeaturePanel';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { NoticeBanner } from '@/components/dashboard/NoticeBanner';
import { Panel } from '@/components/dashboard/Panel';
import { StackedColumnChart, type ColumnSeries, type StackedColumn } from '@/components/dashboard/StackedColumnChart';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { fetchList, fetchOne } from '@/lib/api/envelope';
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

// Colour follows the group, so boys stay blue and girls orange on every chart.
const GENDER_PARTS = {
  male: { label: 'Boys', fillClass: 'fill-primary-700', dotClass: 'bg-primary-700' },
  female: { label: 'Girls', fillClass: 'fill-accent', dotClass: 'bg-accent' },
  unspecified: { label: 'Not recorded', fillClass: 'fill-border-strong', dotClass: 'bg-border-strong' },
};

const CLASS_SERIES: ColumnSeries[] = [{ id: 'students', label: 'Students', fillClass: 'fill-chart-blue-on-navy', dotClass: 'bg-chart-blue-on-navy' }];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [schoolAdmins, setSchoolAdmins] = useState<number | null>(null);
  const [pendingLibrary, setPendingLibrary] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [statRows, analyticRows, accounts, library] = await Promise.all([
        fetchOne<Stats>('/api/v1/admin/system/stats'),
        fetchOne<Analytics>('/api/v1/admin/system/analytics'),
        fetchOne<{ schoolAdmins: number }>('/api/v1/admin/accounts/summary'),
        fetchList('/api/v1/library/content?scope=pending'),
      ]);
      setStats(statRows);
      setAnalytics(analyticRows);
      setSchoolAdmins(accounts?.schoolAdmins ?? null);
      setPendingLibrary(library.length);
      setLoading(false);
    })();
  }, []);

  const columns = useMemo<StackedColumn[]>(
    () =>
      (analytics?.population ?? []).map((row) => ({
        id: row.label,
        label: shortClassLabel(row.label),
        name: row.label,
        values: [row.count],
      })),
    [analytics],
  );
  const genderParts = useMemo<DonutPart[]>(
    () =>
      (analytics?.gender ?? []).map((row) => ({
        id: row.gender,
        value: row.count,
        ...GENDER_PARTS[row.gender],
      })),
    [analytics],
  );
  const genderTotal = genderParts.reduce((sum, part) => sum + part.value, 0);
  const count = (value?: number) => (value ?? 0).toLocaleString('en-GB');

  return (
    <DashboardPage>
      {pendingLibrary > 0 && (
        <NoticeBanner
          title="Library approvals waiting"
          message={`${pendingLibrary.toLocaleString('en-GB')} ${pendingLibrary === 1 ? 'item needs' : 'items need'} your review.`}
          href="/admin/system/library"
          actionLabel="Review"
        />
      )}

      <MetricGrid>
        <MetricCard icon={Building2} label="Schools" tone="navy" value={count(stats?.schools)} href="/admin/system/schools" loading={loading} />
        <MetricCard icon={Users} label="Staff" tone="accent" value={count(stats?.staff)} note={schoolAdmins === null ? undefined : `${count(schoolAdmins)} school ${schoolAdmins === 1 ? 'admin' : 'admins'}`} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={GraduationCap} label="Students" value={count(stats?.students)} href="/admin/system/accounts" loading={loading} />
        <MetricCard icon={UserRound} label="Parents" value={count(stats?.parents)} href="/admin/system/accounts" loading={loading} />
      </MetricGrid>

      <DashboardFeatureRow
        feature={
          <FeaturePanel
            title="Students by class"
            description="Across every school"
            figure={count(stats?.students)}
            figureLabel="students enrolled"
            loading={loading}
            empty={columns.length === 0 ? 'No students enrolled yet.' : undefined}
          >
            <StackedColumnChart columns={columns} series={CLASS_SERIES} unit="students" ariaLabel="Students in each class" />
          </FeaturePanel>
        }
        side={
          <Panel icon={Users} title="Students by gender" description="Across every school" loading={loading} empty={genderTotal === 0 ? 'No students yet.' : undefined}>
            <DonutChart parts={genderParts} centerValue={count(genderTotal)} centerLabel="students" ariaLabel="Students by gender" />
          </Panel>
        }
      />

      <DashboardColumns
        left={<ComingUpPanel href="/admin/calendar" />}
        right={
          <Panel icon={Activity} title="Recent activity" description="Enrolments and marks" loading={loading}>
            <ActivityFeed items={analytics?.activity ?? []} />
          </Panel>
        }
      />
    </DashboardPage>
  );
}
