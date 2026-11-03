'use client';

import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { AttendanceClassSummary, ClassPopulation, TrendPoint } from '@/lib/school-admin/dashboard';
import { ClassBarChart, type ClassBar } from './ClassBarChart';
import { PanelHeader } from './PanelHeader';

type View = 'students' | 'attendance' | 'results';

const TITLES: Record<View, string> = {
  students: 'Students by class',
  attendance: 'Attendance by class',
  results: 'Average mark by exam',
};

const CHART_LABELS: Record<View, string> = {
  students: 'Students in each class',
  attendance: 'Attendance rate of each class',
  results: 'Average mark of each published exam',
};

const EMPTY: Record<View, string> = {
  students: 'No classes set up yet.',
  attendance: 'No attendance has been taken this term yet.',
  results: 'Results will show here once an exam is published.',
};

export function ClassBreakdown({
  population,
  attendance,
  trend,
  boys,
  girls,
  termName,
  loading,
}: {
  population: ClassPopulation[];
  attendance: AttendanceClassSummary[];
  trend: TrendPoint[];
  boys: number;
  girls: number;
  termName: string | null;
  loading: boolean;
}) {
  const [view, setView] = useState<View>('students');

  const studentBars = useMemo<ClassBar[]>(
    () =>
      population.map((row) => ({
        id: row.classId,
        label: row.code,
        name: row.name,
        value: row.total,
        details: [
          { label: 'Students', value: String(row.total) },
          { label: 'Boys', value: String(row.boys) },
          { label: 'Girls', value: String(row.girls) },
        ],
      })),
    [population],
  );

  const attendanceBars = useMemo<ClassBar[]>(() => {
    const byClass = new Map(attendance.filter((a) => a.daysTaken > 0).map((a) => [a.classId, a]));
    return population.flatMap((row) => {
      const record = byClass.get(row.classId);
      if (!record) return [];
      return [
        {
          id: row.classId,
          label: row.code,
          name: row.name,
          value: record.rate,
          details: [
            { label: 'Attendance', value: `${record.rate}%` },
            { label: 'Days taken', value: String(record.daysTaken) },
          ],
        },
      ];
    });
  }, [population, attendance]);

  const resultBars = useMemo<ClassBar[]>(
    () =>
      trend.map((point) => ({
        id: point.examId,
        label: point.label,
        name: point.name,
        value: point.value,
        details: [{ label: 'Average', value: `${point.value}%` }],
      })),
    [trend],
  );

  const subtitle = {
    students: `${boys} boys and ${girls} girls`,
    attendance: `${termName ?? 'This term'}, by class, so far`,
    results: 'Published exams, across all subjects',
  }[view];
  const bars = { students: studentBars, attendance: attendanceBars, results: resultBars }[view];

  return (
    <Card>
      <PanelHeader
        icon={BarChart3}
        title={TITLES[view]}
        subtitle={loading ? undefined : subtitle}
        action={
          <div role="group" aria-label="Chart data" className="inline-flex rounded-full border border-border bg-bg-subtle p-0.5">
            {(['students', 'attendance', 'results'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  view === option ? 'bg-white text-primary-900 shadow-sm' : 'text-text-muted hover:text-primary-900'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : bars.length === 0 ? (
        <p className="text-sm text-text-muted">{EMPTY[view]}</p>
      ) : (
        <ClassBarChart
          key={view}
          bars={bars}
          scaleMax={view === 'students' ? undefined : 100}
          ariaLabel={CHART_LABELS[view]}
        />
      )}
    </Card>
  );
}
