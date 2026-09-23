'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList } from '@/lib/api/envelope';
import { useRealtimeSocket } from '@/lib/realtime/useRealtimeSocket';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';
import { Award, Calendar } from 'lucide-react';
import type { PublishedExamSummary } from '@/components/exams/publishedResults';

const fmt = (d: string) => new Date(d).toLocaleDateString();

export default function ParentResultsPage() {
  const toast = useToast();
  const { selectedId, loading: childrenLoading } = useParentChildren();
  const [exams, setExams] = useState<PublishedExamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (studentId: string) => {
    setLoading(true);
    setExams(await fetchList<PublishedExamSummary>(`/api/v1/parent/results?studentId=${studentId}`, toast.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, load]);

  // Publish can land while this page is already open — re-pull the moment
  // it does instead of waiting for a manual refresh.
  useRealtimeSocket((event) => {
    if (event.type === 'notification' && event.notification.type === 'exam_results_published' && selectedId) {
      void load(selectedId);
    }
  });

  const busy = loading || childrenLoading;

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">Results</h1>
      <p className="text-sm text-text-muted mb-6">Every exam your child&apos;s school has published results for.</p>

      {busy ? (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      ) : exams.length === 0 ? (
        <Card className="p-8 text-center">
          <Award className="w-10 h-10 text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No results have been published yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {exams.map((e) => (
            <Card key={e.id} hover className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <h3 className="font-semibold text-primary-900 truncate">{e.name}</h3>
                <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
                  <Calendar className="w-3.5 h-3.5" />
                  {e.termName} · {fmt(e.startsOn)}–{fmt(e.endsOn)}
                </div>
              </div>
              <Link href={`/parent/results/${e.id}?child=${selectedId ?? ''}`}>
                <Button variant="outline">View result</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
