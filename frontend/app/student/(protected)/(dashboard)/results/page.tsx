'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList } from '@/lib/api/envelope';
import { Award, Calendar } from 'lucide-react';
import type { PublishedExamSummary } from '@/components/exams/publishedResults';

const fmt = (d: string) => new Date(d).toLocaleDateString();

export default function MyResultsPage() {
  const toast = useToast();
  const [exams, setExams] = useState<PublishedExamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setExams(await fetchList<PublishedExamSummary>('/api/v1/exams/me', toast.error));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-primary-900 mb-1">My Results</h1>
      <p className="text-sm text-text-muted mb-6">Every exam your school has published results for.</p>

      {loading ? (
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
              <Link href={`/student/results/${e.id}`}>
                <Button variant="outline">View result</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
