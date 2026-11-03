'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, BarChart3, ChevronRight, ClipboardCheck, TrendingUp } from 'lucide-react';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { averageOfResults, type SubjectResult } from '@/lib/dashboard/role-data';
import { ClassBarChart, type ClassBar } from './BarChart';
import { DashboardColumns } from './DashboardPage';
import { MetricCard, MetricGrid } from './MetricCard';
import { Panel } from './Panel';

interface PublishedExam {
  id: string;
  name: string;
  termName: string;
  startsOn: string;
}

interface ExamRow extends PublishedExam {
  average: number | null;
}

/**
 * One learner's published results, shared by the student's and the parent's
 * dashboards so both read the same way.
 */
export function LearnerResultsDashboard({
  listUrl,
  detailUrl,
  resultsHref,
  sidePanel,
}: {
  /** Published exams for this learner. */
  listUrl: string;
  detailUrl: (examId: string) => string;
  resultsHref: (examId?: string) => string;
  sidePanel?: React.ReactNode;
}) {
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    void (async () => {
      setLoading(true);
      const exams = await fetchList<PublishedExam>(listUrl);
      const withAverages = await Promise.all(
        exams.map(async (exam) => {
          const detail = await fetchOne<{ subjects: SubjectResult[] }>(detailUrl(exam.id));
          return { ...exam, average: detail ? averageOfResults(detail.subjects) : null };
        }),
      );
      if (stale) return;
      setRows(withAverages.sort((a, b) => a.startsOn.localeCompare(b.startsOn)));
      setLoading(false);
    })();
    return () => {
      stale = true;
    };
    // detailUrl is rebuilt each render but follows listUrl.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl]);

  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const change =
    latest?.average != null && previous?.average != null ? Math.round((latest.average - previous.average) * 10) / 10 : null;
  const bars = useMemo<ClassBar[]>(
    () =>
      rows
        .filter((row) => row.average !== null)
        .map((row) => ({
          id: row.id,
          label: row.termName,
          name: row.name,
          value: row.average!,
          details: [{ label: 'Average', value: `${row.average}%` }],
        })),
    [rows],
  );

  return (
    <>
      <MetricGrid>
        <MetricCard icon={Award} label="Published results" value={rows.length} href={resultsHref()} loading={loading} />
        <MetricCard
          icon={TrendingUp}
          label="Latest average"
          value={latest?.average != null ? `${latest.average}%` : '—'}
          href={latest ? resultsHref(latest.id) : undefined}
          loading={loading}
        />
        <MetricCard
          icon={BarChart3}
          label="Change from last exam"
          value={change === null ? '—' : `${change > 0 ? '+' : ''}${change}`}
          loading={loading}
        />
        <MetricCard icon={ClipboardCheck} label="Latest exam" value={latest?.termName ?? '—'} loading={loading} />
      </MetricGrid>

      <DashboardColumns
        left={
          <>
            <Panel
              icon={Award}
              title="Results"
              description="Published exams, newest first"
              loading={loading}
              empty={rows.length === 0 ? 'No results have been published yet.' : undefined}
            >
              <ul className="divide-y divide-border">
                {[...rows].reverse().map((row) => (
                  <li key={row.id}>
                    <Link href={resultsHref(row.id)} className="flex items-center justify-between gap-3 py-2.5 group">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-primary-900 truncate">{row.name}</span>
                        <span className="block text-xs text-muted-foreground">{row.termName}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0 text-sm font-semibold text-primary-900 tabular-nums">
                        {row.average !== null ? `${row.average}%` : '—'}
                        <ChevronRight className="size-4 text-text-faint group-hover:text-primary-600" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
            {sidePanel}
          </>
        }
        right={
          <Panel
            icon={BarChart3}
            title="Average mark by exam"
            description="Oldest exam first"
            loading={loading}
            empty={bars.length === 0 ? 'A chart will show here once results are published.' : undefined}
          >
            <ClassBarChart bars={bars} scaleMax={100} ariaLabel="Average mark in each published exam" />
          </Panel>
        }
      />
    </>
  );
}
