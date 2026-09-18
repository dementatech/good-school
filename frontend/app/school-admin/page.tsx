'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { Sparkline } from '@/components/ui/Sparkline';
import { GenderDonutChart } from '@/components/ui/GenderDonutChart';
import { PopulationBarChart } from '@/components/ui/PopulationBarChart';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { Layers, UserCog, GraduationCap, TrendingUp } from 'lucide-react';
import { fetchList, fetchOne } from '@/lib/api/envelope';

interface Stats {
  classes: number;
  staff: number;
  students: number;
  attendance: number;
  assessments: number;
}

interface TrendPoint {
  label: string;
  value: number;
}

interface GenderBreakdownEntry {
  gender: 'male' | 'female' | 'unspecified';
  count: number;
}

interface PopulationEntry {
  label: string;
  count: number;
}

interface ActivityItem {
  type: 'enrollment' | 'submission';
  label: string;
  timestamp: string;
}

interface Analytics {
  gender: GenderBreakdownEntry[];
  population: PopulationEntry[];
  activity: ActivityItem[];
}

// Strictly 4 cards total with Performance below — attendance/assessments
// have no backend yet (see the fetch comment below) so they're not "important"
// numbers to lead with yet.
const CARDS = [
  { key: 'classes' as const, label: 'Classes & Streams', href: '/school-admin/classes', icon: Layers },
  { key: 'staff' as const, label: 'Staff', href: '/school-admin/staff', icon: UserCog },
  { key: 'students' as const, label: 'Students', href: '/school-admin/students', icon: GraduationCap },
];

export default function SchoolAdminDashboard() {
  const [stats, setStats] = useState<Stats>({ classes: 0, staff: 0, students: 0, attendance: 0, assessments: 0 });
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // classes/staff/students are real endpoints; attendance/assessments have
      // no backend yet (roadmap work) and fetchList's `[]`-on-failure fallback
      // is exactly the "show nothing rather than crash" behaviour wanted here.
      const [classes, staff, students, attendance, assessments] = await Promise.all([
        fetchList('/api/v1/academic/classes'),
        fetchList('/api/v1/staff'),
        fetchList('/api/v1/students'),
        fetchList('/api/v1/school-admin/attendance'),
        fetchList('/api/v1/school-admin/assessments'),
      ]);
      setStats({
        classes: classes.length,
        staff: staff.length,
        students: students.length,
        attendance: attendance.length,
        assessments: assessments.length,
      });
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadTrend() {
      setTrend(await fetchList<TrendPoint>('/api/v1/school-admin/performance?trend=1'));
    }
    loadTrend();
  }, []);

  useEffect(() => {
    async function loadAnalytics() {
      setAnalytics(await fetchOne<Analytics>('/api/v1/school-admin/analytics'));
      setAnalyticsLoading(false);
    }
    loadAnalytics();
  }, []);

  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Your school's classes, staff, students and activity." />

      <DashboardGrid className="mb-4">
        {CARDS.map((c, i) => (
          <StatCard
            key={c.key}
            icon={c.icon}
            label={c.label}
            href={c.href}
            value={stats[c.key]}
            loading={loading}
            accent={i === 0 ? 'hero' : 'neutral'}
          />
        ))}

        <StatCard
          icon={TrendingUp}
          label="Performance"
          href="/school-admin/performance"
          value={trend.length > 0 ? `${trend[trend.length - 1].value}%` : '—'}
          accent="gold"
          trailing={<Sparkline points={trend.map((t) => t.value)} />}
        />
      </DashboardGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Students by gender</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <GenderDonutChart data={analytics?.gender ?? []} />
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Population by class</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <PopulationBarChart data={analytics?.population ?? []} />
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Recent activity</h2>
          {analyticsLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : (
            <ActivityFeed items={analytics?.activity ?? []} />
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
