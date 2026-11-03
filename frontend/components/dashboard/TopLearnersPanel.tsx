'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/kit/avatar';
import { Badge } from '@/components/kit/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/kit/select';
import { fetchOne } from '@/lib/api/envelope';
import { initialsOf, ordinal, type ClassPopulation, type DashboardExam } from '@/lib/school-admin/dashboard';
import { Panel } from './Panel';

interface Performer {
  studentUserId: string;
  studentName: string;
  photoUrl: string | null;
  rank: number | null;
  /** O-Level, Primary and Nursery. */
  average: number | null;
  /** A-Level, which ranks on principal subjects and leaves `average` empty. */
  principalAverage: number | null;
}

interface ReportCard {
  showPositions: boolean;
  topPerformers: Performer[];
}

const SHOWN = 4;

/** The best in a class in the latest published exam. */
export function TopLearnersPanel({
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

  const current = result?.key === key ? result?.card : null;
  const pending = loading || (key !== null && result?.key !== key);
  const performers = (current?.topPerformers ?? []).slice(0, SHOWN);

  return (
    <Panel
      icon={Trophy}
      title="Top learners"
      description={exam?.name ?? 'Best overall average'}
      loading={pending}
      empty={
        !exam
          ? 'Top learners will show here once exam results are published.'
          : performers.length === 0
            ? 'No results for this class in this exam.'
            : undefined
      }
      action={
        classes.length > 0 && exam ? (
          <Select value={classId ?? undefined} onValueChange={setPicked}>
            <SelectTrigger size="sm" aria-label="Class" className="rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.classId} value={c.classId}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {performers.map((p) => {
          const score = p.average ?? p.principalAverage;
          return (
            <li key={p.studentUserId} className="rounded-xl bg-bg-canvas p-3 text-center min-w-0">
              <Avatar className="size-14 mx-auto">
                {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                <AvatarFallback className="bg-primary-100 text-primary-700 font-bold">{initialsOf(p.studentName)}</AvatarFallback>
              </Avatar>
              {current?.showPositions && p.rank !== null && (
                <Badge variant="secondary" className="mt-2">
                  {ordinal(p.rank)}
                </Badge>
              )}
              <p className="mt-1.5 text-xs font-semibold text-primary-900 truncate" title={p.studentName}>
                {p.studentName}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">{score !== null ? `${score}% average` : '—'}</p>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
