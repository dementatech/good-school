'use client';

import { useEffect, useState } from 'react';
import { Activity, CalendarCheck, GraduationCap, Layers, UserCog } from 'lucide-react';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { Card } from '@/components/ui/Card';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import {
  latestPublishedExam,
  localIsoDate,
  ongoingExams,
  overallAttendanceRate,
  pickCurrentTerm,
  pickNotice,
  summariseMarks,
  type AttendanceClassSummary,
  type CompletionSlot,
  type DashboardExam,
  type DashboardTerm,
  type MarksProgress,
  type SchoolAnalytics,
  type TrendPoint,
} from '@/lib/school-admin/dashboard';
import { ClassBreakdown } from '@/components/school-admin/dashboard/ClassBreakdown';
import { DashboardGreeting } from '@/components/school-admin/dashboard/DashboardGreeting';
import { DashboardNotice } from '@/components/school-admin/dashboard/DashboardNotice';
import { MetricTile } from '@/components/school-admin/dashboard/MetricTile';
import { PanelHeader } from '@/components/school-admin/dashboard/PanelHeader';
import { OngoingExams } from '@/components/school-admin/dashboard/OngoingExams';
import { TopLearners } from '@/components/school-admin/dashboard/TopLearners';
import { UpcomingEvents, type UpcomingEvent } from '@/components/school-admin/dashboard/UpcomingEvents';

const UPCOMING_DAYS = 30;
const UPCOMING_LIMIT = 4;

export default function SchoolAdminDashboard() {
  const toast = useToast();
  const [today] = useState(() => localIsoDate(new Date()));
  const [analytics, setAnalytics] = useState<SchoolAnalytics | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const [exams, setExams] = useState<DashboardExam[]>([]);
  const [progress, setProgress] = useState<Record<string, MarksProgress | undefined>>({});
  const [examsLoading, setExamsLoading] = useState(true);

  const [term, setTerm] = useState<DashboardTerm | null>(null);
  const [attendance, setAttendance] = useState<AttendanceClassSummary[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [summary, points] = await Promise.all([
        fetchOne<SchoolAnalytics>('/api/v1/school-admin/analytics', toast.error),
        fetchList<TrendPoint>('/api/v1/school-admin/performance?trend=1'),
      ]);
      setAnalytics(summary);
      setTrend(points);
      setLoading(false);
    })();

    void (async () => {
      const examRows = await fetchList<DashboardExam>('/api/v1/exams', toast.error);
      const completions = await Promise.all(
        ongoingExams(examRows).map(async (exam) => {
          const data = await fetchOne<{ slots: CompletionSlot[] }>(`/api/v1/exams/${exam.id}/completion`);
          return [exam.id, data ? summariseMarks(data.slots) : undefined] as const;
        }),
      );
      setExams(examRows);
      setProgress(Object.fromEntries(completions));
      setExamsLoading(false);
    })();

    void (async () => {
      const current = pickCurrentTerm(await fetchList<DashboardTerm>('/api/v1/academic/terms'), today);
      setTerm(current);
      if (current) {
        const to = current.endDate < today ? current.endDate : today;
        const summary = await fetchOne<{ classes: AttendanceClassSummary[] }>(
          `/api/v1/attendance/summary?from=${current.startDate}&to=${to}`,
        );
        setAttendance(summary?.classes ?? []);
      }
      setAttendanceLoading(false);
    })();

    void (async () => {
      const until = new Date();
      until.setDate(until.getDate() + UPCOMING_DAYS);
      const rows = await fetchList<UpcomingEvent>(`/api/v1/events?from=${today}&to=${localIsoDate(until)}`);
      setEvents(rows.slice(0, UPCOMING_LIMIT));
      setEventsLoading(false);
    })();
    // Loads once per visit. toast and today never change meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notice = examsLoading ? null : pickNotice(exams, progress, today);
  const rate = overallAttendanceRate(attendance);
  const population = analytics?.population ?? [];
  const countOf = (value?: number) => (value === undefined ? '—' : value.toLocaleString('en-GB'));

  return (
    <DashboardShell rail={false}>
      <DashboardGreeting className="md:hidden mb-3" />

      {notice && <DashboardNotice notice={notice} />}

      <DashboardGrid className="mb-3 sm:mb-4">
        <MetricTile icon={GraduationCap} label="Students" href="/school-admin/students" value={countOf(analytics?.counts.students)} />
        <MetricTile icon={UserCog} label="Staff" href="/school-admin/staff" value={countOf(analytics?.counts.staff)} />
        <MetricTile icon={Layers} label="Classes" href="/school-admin/classes" value={countOf(analytics?.counts.classes)} />
        <MetricTile
          icon={CalendarCheck}
          label="Attendance this term"
          href="/school-admin/attendance"
          value={attendanceLoading || rate === null ? '—' : `${rate}%`}
        />
      </DashboardGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
        <div className="space-y-3 sm:space-y-4 min-w-0">
          <OngoingExams exams={ongoingExams(exams)} progress={progress} today={today} loading={examsLoading} />
          <UpcomingEvents events={events} loading={eventsLoading} />
          <Card>
            <PanelHeader icon={Activity} title="Recent activity" subtitle="Enrolments and mark sheets" />
            {loading ? (
              <p className="text-sm text-text-muted">Loading…</p>
            ) : (
              <ActivityFeed items={analytics?.activity ?? []} />
            )}
          </Card>
        </div>
        <div className="space-y-3 sm:space-y-4 min-w-0">
          <ClassBreakdown
            population={population}
            attendance={attendance}
            trend={trend}
            boys={analytics?.gender.male ?? 0}
            girls={analytics?.gender.female ?? 0}
            termName={term?.name ?? null}
            loading={loading || attendanceLoading}
          />
          <TopLearners exam={latestPublishedExam(exams)} classes={population} loading={examsLoading || loading} />
        </div>
      </div>
    </DashboardShell>
  );
}
