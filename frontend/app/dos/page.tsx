'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, ClipboardList, FileCheck2, NotebookPen } from 'lucide-react';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardColumns, DashboardPage } from '@/components/dashboard/DashboardPage';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { OngoingExamsPanel } from '@/components/dashboard/OngoingExamsPanel';
import { Panel } from '@/components/dashboard/Panel';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { registersNotTaken, type RegisterClass } from '@/lib/dashboard/role-data';
import {
  localIsoDate,
  ongoingExams,
  summariseMarks,
  type CompletionSlot,
  type DashboardExam,
  type MarksProgress,
} from '@/lib/school-admin/dashboard';

/** The Director of Studies' landing page: what's waiting for them today. */
export default function DosOverview() {
  const toast = useToast();
  const [today] = useState(() => localIsoDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [schemes, setSchemes] = useState(0);
  const [plans, setPlans] = useState(0);
  const [registers, setRegisters] = useState<RegisterClass[]>([]);
  const [exams, setExams] = useState<DashboardExam[]>([]);
  const [progress, setProgress] = useState<Record<string, MarksProgress | undefined>>({});
  const [examsLoading, setExamsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [schemeRows, planRows, attendance] = await Promise.all([
        fetchList('/api/v1/lesson-prep/schemes?status=submitted', toast.error),
        fetchList('/api/v1/lesson-prep/plans?status=submitted', toast.error),
        fetchOne<{ classes: RegisterClass[] }>('/api/v1/attendance/classes', toast.error),
      ]);
      setSchemes(schemeRows.length);
      setPlans(planRows.length);
      setRegisters(attendance?.classes ?? []);
      setLoading(false);
    })();
    void (async () => {
      const rows = ongoingExams(await fetchList<DashboardExam>('/api/v1/exams'));
      const completions = await Promise.all(
        rows.map(async (exam) => {
          const data = await fetchOne<{ slots: CompletionSlot[] }>(`/api/v1/exams/${exam.id}/completion`);
          return [exam.id, data ? summariseMarks(data.slots) : undefined] as const;
        }),
      );
      setExams(rows);
      setProgress(Object.fromEntries(completions));
      setExamsLoading(false);
    })();
    // Loads once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notTaken = registersNotTaken(registers);

  return (
    <DashboardPage>
      <MetricGrid>
        <MetricCard icon={NotebookPen} label="Schemes of work to review" value={schemes} href="/dos/lessons" loading={loading} />
        <MetricCard icon={FileCheck2} label="Lesson plans to review" value={plans} href="/dos/lessons" loading={loading} />
        <MetricCard
          icon={ClipboardCheck}
          label="Registers taken today"
          value={`${registers.length - notTaken.length} / ${registers.length}`}
          href="/dos/attendance"
          loading={loading}
        />
        <MetricCard icon={ClipboardList} label="Exams in progress" value={exams.length} href="/dos/exams" loading={examsLoading} />
      </MetricGrid>

      <DashboardColumns
        left={
          <>
            <OngoingExamsPanel exams={exams} progress={progress} today={today} loading={examsLoading} base="/dos" />
          </>
        }
        right={
          <>
            <Panel
              icon={ClipboardCheck}
              title="Registers not yet taken"
              description="Today"
              loading={loading}
              empty={notTaken.length === 0 ? 'Every register has been started today.' : undefined}
            >
              <ul className="divide-y divide-border">
                {notTaken.map((c) => (
                  <li key={c.classId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-medium text-primary-900">{c.className}</span>
                    <span className="text-muted-foreground truncate">{c.classTeacherName ?? 'No class teacher'}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <ComingUpPanel href="/dos/calendar" />
          </>
        }
      />
    </DashboardPage>
  );
}
