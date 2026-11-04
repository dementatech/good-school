'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarCheck, CalendarDays, ClipboardCheck, GraduationCap, Layers, LineChart, UserCog, Users } from 'lucide-react';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardChartRow, DashboardColumns, DashboardFeatureRow, DashboardPage } from '@/components/dashboard/DashboardPage';
import { DonutChart, type DonutPart } from '@/components/dashboard/DonutChart';
import { FeaturePanel } from '@/components/dashboard/FeaturePanel';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { NoticeBanner } from '@/components/dashboard/NoticeBanner';
import { OngoingExamsPanel } from '@/components/dashboard/OngoingExamsPanel';
import { Panel } from '@/components/dashboard/Panel';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { StackedColumnChart, type ColumnSeries } from '@/components/dashboard/StackedColumnChart';
import { TopLearnersPanel } from '@/components/dashboard/TopLearnersPanel';
import { TrendLine } from '@/components/dashboard/TrendLine';
import { ActivityFeed } from '@/components/ui/ActivityFeed';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import {
  ATTENDANCE_TARGET,
  attendanceMix,
  classesBelowTarget,
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
  const population = useMemo(() => analytics?.population ?? [], [analytics]);
  const counts = analytics?.counts;
  const gender = analytics?.gender;
  const countOf = (value?: number) => (value === undefined ? '—' : value.toLocaleString('en-GB'));

  const below = classesBelowTarget(attendance);
  const perClass = counts && counts.classes > 0 ? Math.round(counts.students / counts.classes) : null;
  const perStaff = counts && counts.staff > 0 ? Math.round(counts.students / counts.staff) : null;
  const unrecorded = population.some((row) => row.total > row.boys + row.girls);

  const series = useMemo<ColumnSeries[]>(
    () => [
      { id: 'boys', label: 'Boys', fillClass: 'fill-chart-blue-on-navy', dotClass: 'bg-chart-blue-on-navy' },
      { id: 'girls', label: 'Girls', fillClass: 'fill-accent', dotClass: 'bg-accent' },
      ...(unrecorded ? [{ id: 'other', label: 'Not recorded', fillClass: 'fill-white/40', dotClass: 'bg-white/40' }] : []),
    ],
    [unrecorded],
  );
  const columns = useMemo(
    () =>
      population.map((row) => ({
        id: row.classId,
        label: row.code,
        name: row.name,
        values: [row.boys, row.girls, ...(unrecorded ? [Math.max(row.total - row.boys - row.girls, 0)] : [])],
      })),
    [population, unrecorded],
  );

  const genderParts = useMemo<DonutPart[]>(
    () =>
      gender
        ? [
            { id: 'boys', label: 'Boys', value: gender.male, fillClass: 'fill-primary-700', dotClass: 'bg-primary-700' },
            { id: 'girls', label: 'Girls', value: gender.female, fillClass: 'fill-accent', dotClass: 'bg-accent' },
            ...(gender.unspecified > 0
              ? [{ id: 'other', label: 'Not recorded', value: gender.unspecified, fillClass: 'fill-border-strong', dotClass: 'bg-border-strong' }]
              : []),
          ]
        : [],
    [gender],
  );
  const genderTotal = genderParts.reduce((sum, part) => sum + part.value, 0);

  const mixParts = useMemo<DonutPart[]>(() => {
    const mix = attendanceMix(attendance);
    return [
      { id: 'present', label: 'Present', value: mix.present, fillClass: 'fill-success', dotClass: 'bg-success' },
      { id: 'late', label: 'Late', value: mix.late, fillClass: 'fill-warning', dotClass: 'bg-warning' },
      { id: 'absent', label: 'Absent', value: mix.absent, fillClass: 'fill-error', dotClass: 'bg-error' },
      { id: 'excused', label: 'Excused', value: mix.excused, fillClass: 'fill-border-strong', dotClass: 'bg-border-strong' },
    ];
  }, [attendance]);

  const trendPoints = useMemo(() => trend.map((p) => ({ id: p.examId, label: p.label, name: p.name, value: p.value })), [trend]);

  const ranked = attendance
    .filter((c) => c.daysTaken > 0)
    .map((c) => ({ id: c.classId, label: c.className, percent: c.rate }));
  const termLabel = term?.name ?? 'This term';

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
        <MetricCard
          icon={GraduationCap}
          label="Students"
          href="/school-admin/students"
          value={countOf(counts?.students)}
          note={gender ? `${gender.male.toLocaleString('en-GB')} boys, ${gender.female.toLocaleString('en-GB')} girls` : undefined}
          loading={loading}
        />
        <MetricCard
          icon={UserCog}
          tone="navy"
          label="Staff"
          href="/school-admin/staff"
          value={countOf(counts?.staff)}
          note={perStaff === null ? undefined : `${perStaff} students per staff`}
          loading={loading}
        />
        <MetricCard
          icon={Layers}
          tone="accent"
          label="Classes"
          href="/school-admin/classes"
          value={countOf(counts?.classes)}
          note={perClass === null ? undefined : `About ${perClass} students each`}
          loading={loading}
        />
        <MetricCard
          icon={CalendarCheck}
          tone={rate === null ? 'primary' : rate < ATTENDANCE_TARGET || below > 0 ? 'warning' : 'success'}
          label="Attendance this term"
          href="/school-admin/attendance"
          value={rate === null ? '—' : `${rate}%`}
          note={
            rate === null
              ? 'Not taken yet'
              : below > 0
                ? `${below} ${below === 1 ? 'class' : 'classes'} below ${ATTENDANCE_TARGET}%`
                : `Every class at ${ATTENDANCE_TARGET}% or above`
          }
          loading={attendanceLoading}
        />
      </MetricGrid>

      <DashboardFeatureRow
        feature={
          <FeaturePanel
            title="Students by class"
            description="Tap a class to read it"
            figure={countOf(counts?.students)}
            figureLabel="students enrolled"
            loading={loading}
            empty={columns.length === 0 ? 'No classes set up yet.' : undefined}
          >
            <StackedColumnChart columns={columns} series={series} unit="students" ariaLabel="Students in each class, by gender" />
          </FeaturePanel>
        }
        side={
          <Panel icon={Users} title="Students by gender" description="Whole school" loading={loading} empty={genderTotal === 0 ? 'No students yet.' : undefined}>
            <DonutChart parts={genderParts} centerValue={countOf(genderTotal)} centerLabel="students" ariaLabel="Students by gender" />
          </Panel>
        }
      />

      <DashboardChartRow>
        <Panel
          icon={ClipboardCheck}
          title="Attendance by class"
          description={`${termLabel}, lowest first`}
          loading={attendanceLoading}
          empty={ranked.length === 0 ? 'No attendance has been taken this term yet.' : undefined}
        >
          <RankedBars rows={ranked} target={ATTENDANCE_TARGET} ariaLabel="Attendance rate of each class, lowest first" />
        </Panel>
        <Panel
          icon={CalendarDays}
          title="Attendance breakdown"
          description={`${termLabel}, every mark so far`}
          loading={attendanceLoading}
          empty={rate === null ? 'No attendance has been taken this term yet.' : undefined}
        >
          <DonutChart parts={mixParts} centerValue={`${rate}%`} centerLabel="attended" ariaLabel="Attendance marks by status" />
        </Panel>
        <Panel
          icon={LineChart}
          title="Average mark by exam"
          description="Published exams, all subjects"
          loading={loading}
          empty={trend.length === 0 ? 'Results will show here once an exam is published.' : undefined}
        >
          <TrendLine points={trendPoints} ariaLabel="Average mark of each published exam" />
        </Panel>
      </DashboardChartRow>

      <DashboardColumns
        left={
          <>
            <OngoingExamsPanel exams={ongoingExams(exams)} progress={progress} today={today} loading={examsLoading} base="/school-admin" />
            <ComingUpPanel href="/school-admin/calendar" />
          </>
        }
        right={
          <>
            <TopLearnersPanel exam={latestPublishedExam(exams)} classes={population} loading={examsLoading || loading} />
            <Panel icon={Activity} title="Recent activity" description="Enrolments and mark sheets" loading={loading}>
              <ActivityFeed items={analytics?.activity ?? []} />
            </Panel>
          </>
        }
      />
    </DashboardPage>
  );
}
