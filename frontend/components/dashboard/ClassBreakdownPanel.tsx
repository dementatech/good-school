'use client';

import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/kit/tabs';
import type { AttendanceClassSummary, ClassPopulation, TrendPoint } from '@/lib/school-admin/dashboard';
import { ClassBarChart, type ClassBar } from './BarChart';
import { Panel } from './Panel';

type View = 'students' | 'attendance' | 'results';

const VIEWS: { value: View; label: string; title: string; chart: string; empty: string }[] = [
  { value: 'students', label: 'Students', title: 'Students by class', chart: 'Students in each class', empty: 'No classes set up yet.' },
  { value: 'attendance', label: 'Attendance', title: 'Attendance by class', chart: 'Attendance rate of each class', empty: 'No attendance has been taken this term yet.' },
  { value: 'results', label: 'Results', title: 'Average mark by exam', chart: 'Average mark of each published exam', empty: 'Results will show here once an exam is published.' },
];

export function ClassBreakdownPanel({
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
  const config = VIEWS.find((v) => v.value === view)!;

  const bars = useMemo<ClassBar[]>(() => {
    if (view === 'students') {
      return population.map((row) => ({
        id: row.classId,
        label: row.code,
        name: row.name,
        value: row.total,
        details: [
          { label: 'Students', value: String(row.total) },
          { label: 'Boys', value: String(row.boys) },
          { label: 'Girls', value: String(row.girls) },
        ],
      }));
    }
    if (view === 'results') {
      return trend.map((point) => ({
        id: point.examId,
        label: point.label,
        name: point.name,
        value: point.value,
        details: [{ label: 'Average', value: `${point.value}%` }],
      }));
    }
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
  }, [view, population, attendance, trend]);

  const description = {
    students: `${boys} boys and ${girls} girls`,
    attendance: `${termName ?? 'This term'}, by class, so far`,
    results: 'Published exams, across all subjects',
  }[view];

  return (
    <Panel
      icon={BarChart3}
      title={config.title}
      description={loading ? undefined : description}
      loading={loading}
      empty={bars.length === 0 ? config.empty : undefined}
      action={
        <Tabs value={view} onValueChange={(next) => setView(next as View)}>
          <TabsList className="h-8">
            {VIEWS.map((v) => (
              <TabsTrigger key={v.value} value={v.value} className="text-xs">
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      <ClassBarChart key={view} bars={bars} scaleMax={view === 'students' ? undefined : 100} ariaLabel={config.chart} />
    </Panel>
  );
}
