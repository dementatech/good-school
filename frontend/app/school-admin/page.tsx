'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/ui/Sparkline';
import { GenderDonutChart } from '@/components/ui/GenderDonutChart';
import { PopulationBarChart } from '@/components/ui/PopulationBarChart';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { Layers, UserCog, GraduationCap, ClipboardCheck, ClipboardList, TrendingUp } from 'lucide-react';
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

const CARDS = [
  { key: 'classes' as const, label: 'Classes & Streams', href: '/school-admin/classes', icon: Layers },
  { key: 'staff' as const, label: 'Staff', href: '/school-admin/staff', icon: UserCog },
  { key: 'students' as const, label: 'Students', href: '/school-admin/students', icon: GraduationCap },
  { key: 'attendance' as const, label: 'Attendance Sessions', href: '/school-admin/attendance', icon: ClipboardCheck },
  { key: 'assessments' as const, label: 'Assessments', href: '/school-admin/assessments', icon: ClipboardList },
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
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">Your school&apos;s classes, staff, students and activity.</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4 mb-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href}>
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

        <Link href="/school-admin/performance">
          <Card hover className="p-3 sm:p-5">
            <div className="p-2 sm:p-2.5 rounded-xl bg-accent-lighter w-fit mb-2 sm:mb-3">
              <TrendingUp className="w-5 h-5 text-accent-dark" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary-900 tabular-nums">
              {trend.length > 0 ? `${trend[trend.length - 1].value}%` : '—'}
            </p>
            <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 mt-1">
              <p className="text-sm text-text-muted">Performance</p>
              <div className="shrink-0"><Sparkline points={trend.map((t) => t.value)} /></div>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
    </div>
  );
}
