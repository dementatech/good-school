'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { TermsManager } from '@/components/admin/TermsManager';
import { useToast } from '@/components/ui/ToastProvider';

interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}

export default function SchoolAdminTermsPage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/academic/years');
        const data = await res.json();
        if (data.success) {
          setYears(data.data);
          const current = data.data.find((y: AcademicYear) => y.isCurrent);
          setYearId(current?.id ?? data.data[0]?.id ?? '');
        } else {
          toast.error(data.error ?? 'Failed to load academic years.');
        }
      } catch {
        toast.error('Network error while loading academic years.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Terms</h1>
        <p className="text-sm text-text-muted">
          Up to 3 terms per academic year. A record&apos;s date resolves to whichever term it
          falls within.
        </p>
      </div>

      <Card>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader size={36} /></div>
        ) : years.length === 0 ? (
          <p className="text-sm text-text-muted">
            No academic years exist yet — create one under Academic Years &amp; Terms first.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">
                Academic year
              </label>
              <select
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                className="w-full xs:w-auto h-11 sm:h-9 border border-border rounded-lg px-3 text-sm"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.yearName}
                    {y.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {yearId && (
              <TermsManager key={yearId} apiBasePath="/api/v1/academic/terms" academicYearId={yearId} />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
