'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { DashboardGrid } from '@/components/ui/DashboardGrid';
import { DashboardShell } from '@/components/ui/DashboardShell';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { ClipboardCheck, FileCheck2, NotebookPen } from 'lucide-react';

interface RegisterClass {
  classId: string;
  className: string;
  classTeacherName: string | null;
  pupils: number;
  marked: number;
}

interface Overview {
  schemesToReview: number;
  plansToReview: number;
  registers: RegisterClass[];
}

/** The Director of Studies' landing page: what's waiting for them today. */
export default function DosOverview() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [schemes, plans, attendance] = await Promise.all([
        fetchList(`/api/v1/lesson-prep/schemes?status=submitted`, toast.error),
        fetchList(`/api/v1/lesson-prep/plans?status=submitted`, toast.error),
        fetchOne<{ classes: RegisterClass[] }>(`/api/v1/attendance/classes`, toast.error),
      ]);
      if (!cancelled) {
        setData({
          schemesToReview: schemes.length,
          plansToReview: plans.length,
          registers: attendance?.classes ?? [],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast.error]);

  const registers = data?.registers ?? [];
  const taken = registers.filter((c) => c.marked > 0).length;
  const notTaken = registers.filter((c) => c.pupils > 0 && c.marked === 0);

  return (
    <DashboardShell>
      <WelcomeBanner subtitle="Lesson preparation, timetables, registers and exams across the school." />

      <DashboardGrid>
        <StatCard
          icon={NotebookPen}
          label="Schemes of work to review"
          href="/dos/lessons"
          value={data?.schemesToReview}
          loading={!data}
          accent="hero"
        />
        <StatCard
          icon={FileCheck2}
          label="Lesson plans to review"
          href="/dos/lessons"
          value={data?.plansToReview}
          loading={!data}
        />
        <StatCard
          icon={ClipboardCheck}
          label="Registers taken today"
          href="/dos/attendance"
          value={data ? `${taken} / ${registers.length}` : undefined}
          loading={!data}
        />
      </DashboardGrid>

      {data && notTaken.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-primary-900 mb-3">Registers not yet taken today</h2>
          <ul className="divide-y divide-border">
            {notTaken.map((c) => (
              <li key={c.classId} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-primary-900">{c.className}</span>
                <span className="text-text-muted">{c.classTeacherName ?? 'No class teacher'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </DashboardShell>
  );
}
