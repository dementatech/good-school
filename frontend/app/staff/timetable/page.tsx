'use client';

import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import type { Period, Slot, TermContext } from '@/components/timetable/types';

const SECTION_LABEL: Record<string, string> = { KINDERGARTEN: 'Nursery', PRIMARY: 'Primary', SECONDARY: 'Secondary' };

/** A teacher's own week: every lesson they teach, in any class or section. */
export default function StaffTimetablePage() {
  const toast = useToast();
  const [context, setContext] = useState<TermContext | null>(null);
  const [termId, setTermId] = useState('');
  const [data, setData] = useState<{ periodsBySection: Record<string, Period[]>; days: number[]; slots: Slot[] } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const ctx = await fetchOne<TermContext>('/api/v1/timetable/context', toast.error);
      setContext(ctx);
      setTermId(ctx?.currentTermId ?? ctx?.terms[0]?.id ?? '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!termId) return;
    void (async () => {
      setData(await fetchOne(`/api/v1/timetable/me?termId=${termId}`, toast.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const sections = Object.entries(data?.periodsBySection ?? {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-primary-700" aria-hidden />
            My Timetable
          </h1>
          <p className="text-sm text-text-muted">Every lesson you teach this term.</p>
        </div>
        {(context?.terms.length ?? 0) > 0 && (
          <div className="w-40">
            <Select
              label="Term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              options={context!.terms.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        )}
      </div>

      {!data ? (
        <div className="py-12 flex justify-center">
          <Loader size={44} />
        </div>
      ) : data.slots.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">You have no timetabled lessons this term yet.</p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-text-muted">
            <strong className="text-primary-900">{data.slots.length}</strong> lesson{data.slots.length === 1 ? '' : 's'}{' '}
            a week.
          </p>
          {sections.map(([section, periods]) => (
            <div key={section} className="space-y-2">
              {sections.length > 1 && (
                <h2 className="text-sm font-bold text-primary-900">{SECTION_LABEL[section] ?? section}</h2>
              )}
              <TimetableGrid
                periods={periods}
                days={data.days}
                slots={data.slots.filter((s) => periods.some((p) => p.id === s.periodId))}
                cellLabel="class"
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
