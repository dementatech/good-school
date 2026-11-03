'use client';

import { useEffect, useState } from 'react';
import { Activity, CalendarCheck, GraduationCap, Layers, UserCog } from 'lucide-react';
import { ClassBreakdownPanel } from '@/components/dashboard/ClassBreakdownPanel';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardColumns, DashboardPage } from '@/components/dashboard/DashboardPage';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { NoticeBanner } from '@/components/dashboard/NoticeBanner';
import { OngoingExamsPanel } from '@/components/dashboard/OngoingExamsPanel';
import { Panel } from '@/components/dashboard/Panel';
import { TopLearnersPanel } from '@/components/dashboard/TopLearnersPanel';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
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

    // Loads once per visit. toast and today never change meaningfully.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notice = examsLoading ? null : pickNotice(exams, progress, today);
  const rate = overallAttendanceRate(attendance);
  const population = analytics?.population ?? [];
  const countOf = (value?: number) => (value === undefined ? '—' : value.toLocaleString('en-GB'));

  return (
    <DashboardPage>
      {notice && (
        <NoticeBanner
          title={notice.title}
          message={notice.message}
          href={`/school-admin/exams/${notice.examId}`}
          actionLabel="View exam"
        />
      )}

      <MetricGrid>
        <MetricCard icon={GraduationCap} label="Students" href="/school-admin/students" value={countOf(analytics?.counts.students)} loading={loading} />
        <MetricCard icon={UserCog} label="Staff" href="/school-admin/staff" value={countOf(analytics?.counts.staff)} loading={loading} />
        <MetricCard icon={Layers} label="Classes" href="/school-admin/classes" value={countOf(analytics?.counts.classes)} loading={loading} />
        <MetricCard
          icon={CalendarCheck}
          label="Attendance this term"
          href="/school-admin/attendance"
          value={rate === null ? '—' : `${rate}%`}
          loading={attendanceLoading}
        />
      </MetricGrid>

      <DashboardColumns
        left={
          <>
            <OngoingExamsPanel exams={ongoingExams(exams)} progress={progress} today={today} loading={examsLoading} base="/school-admin" />
            <ComingUpPanel />
            <Panel icon={Activity} title="Recent activity" description="Enrolments and mark sheets" loading={loading}>
              <ActivityFeed items={analytics?.activity ?? []} />
            </Panel>
          </>
        }
        right={
          <>
            <ClassBreakdownPanel
              population={population}
              attendance={attendance}
              trend={trend}
              boys={analytics?.gender.male ?? 0}
              girls={analytics?.gender.female ?? 0}
              termName={term?.name ?? null}
              loading={loading || attendanceLoading}
            />
            <TopLearnersPanel exam={latestPublishedExam(exams)} classes={population} loading={examsLoading || loading} />
          </>
        }
      />
    </DashboardPage>
  );
}
