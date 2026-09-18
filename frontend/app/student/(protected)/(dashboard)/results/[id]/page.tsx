'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { ArrowLeft } from 'lucide-react';
import { StudentResultTable } from '@/components/exams/StudentResultTable';
import type { StudentExamResult } from '@/components/exams/publishedResults';

export default function StudentResultPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [result, setResult] = useState<StudentExamResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setResult(await fetchOne<StudentExamResult>(`/api/v1/exams/me/${params.id}`, toast.error));
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => router.push('/student/results')}
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary-900"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        Back to results
      </button>

      {loading ? (
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
