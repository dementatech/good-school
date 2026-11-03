'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { fetchOne } from '@/lib/api/envelope';
import { initialsOf, ordinal, type ClassPopulation, type DashboardExam } from '@/lib/school-admin/dashboard';
import { PanelHeader } from './PanelHeader';

interface Performer {
  studentUserId: string;
  studentName: string;
  photoUrl: string | null;
  rank: number | null;
  /** O-Level and Primary. */
  average: number | null;
  /** A-Level, which ranks on principal subjects and leaves `average` empty. */
  principalAverage: number | null;
}

interface ReportCard {
  showPositions: boolean;
  topPerformers: Performer[];
}

const SHOWN = 4;

export function TopLearners({
  exam,
  classes,
  loading,
}: {
  exam: DashboardExam | null;
  classes: ClassPopulation[];
  loading: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const classId = picked ?? classes[0]?.classId ?? null;
  const key = exam && classId ? `${exam.id}/${classId}` : null;
  const [result, setResult] = useState<{ key: string; card: ReportCard | null } | null>(null);

  useEffect(() => {
    if (!exam || !classId || !key) return;
    let stale = false;
    void (async () => {
      const card = await fetchOne<ReportCard>(`/api/v1/exams/${exam.id}/report-card?classId=${classId}`);
      if (!stale) setResult({ key, card });
    })();
    return () => {
      stale = true;
    };
  }, [exam, classId, key]);

  const pending = loading || (key !== null && result?.key !== key);
  const performers = result?.key === key ? (result?.card?.topPerformers ?? []).slice(0, SHOWN) : [];
  const showPositions = result?.card?.showPositions ?? false;

  return (
    <Card>
      <PanelHeader
        icon={Trophy}
        title="Top learners"
        subtitle={exam ? exam.name : 'Best overall average'}
        action={
          classes.length > 0 && exam ? (
            <select
              aria-label="Class"
              value={classId ?? ''}
              onChange={(e) => setPicked(e.target.value)}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-primary-900 focus:border-primary-500 focus:outline-none"
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {pending ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : !exam ? (
        <p className="text-sm text-text-muted">Top learners will show here once exam results are published.</p>
      ) : performers.length === 0 ? (
        <p className="text-sm text-text-muted">No results for this class in this exam.</p>
      ) : (
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {performers.map((p) => {
            const score = p.average ?? p.principalAverage;
            return (
            <li key={p.studentUserId} className="rounded-xl bg-bg-canvas p-2 text-center min-w-0">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt="" className="w-full aspect-[4/3] rounded-lg object-cover" />
              ) : (
                <span className="flex w-full aspect-[4/3] rounded-lg bg-primary-100 text-primary-700 items-center justify-center text-xl font-bold">
                  {initialsOf(p.studentName)}
                </span>
              )}
              <p className="mt-2 text-[11px] font-semibold text-primary-700">
                {showPositions && p.rank !== null ? ordinal(p.rank) : ' '}
              </p>
              <p className="text-xs font-semibold text-primary-900 truncate" title={p.studentName}>
                {p.studentName}
              </p>
              <p className="text-[11px] text-text-muted tabular-nums">
                {score !== null ? `${score}% average` : '—'}
              </p>
            </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
