'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { fetchOne } from '@/lib/api/envelope';
import { useParentChildren } from '@/components/parent/ParentChildrenContext';
import { ArrowLeft } from 'lucide-react';
import { StudentResultTable } from '@/components/exams/StudentResultTable';
import type { StudentExamResult } from '@/components/exams/publishedResults';

export default function ParentResultDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { selectedId, loading: childrenLoading } = useParentChildren();
  const [result, setResult] = useState<StudentExamResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (studentId: string) => {
    setLoading(true);
    setResult(await fetchOne<StudentExamResult>(`/api/v1/parent/results/${params.id}?studentId=${studentId}`));
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load(selectedId);
    })();
    return () => controller.abort();
  }, [selectedId, load]);

  const busy = loading || childrenLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        type="button"
        onClick={() => router.push('/parent/results')}
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-900"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to results
      </button>

      {busy ? (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      ) : !result ? (
        <Card className="p-6 text-center">
          <p className="text-error">This result isn&apos;t available.</p>
        </Card>
      ) : (
        <StudentResultTable result={result} />
      )}
    </div>
  );
}
