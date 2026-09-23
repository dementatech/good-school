'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import { DAY_NAMES, PERIOD_KIND_LABEL, type Period, type PeriodKind, type SchoolSection } from './types';

interface DraftPeriod {
  id?: string;
  label: string;
  startTime: string;
  endTime: string;
  kind: PeriodKind;
}

/**
 * The shape of a school day for one section — its periods, breaks and lunch,
 * and which weekdays it teaches. Removing a period removes any lessons in it.
 */
export function PeriodsEditor({ section, onSaved }: { section: SchoolSection; onSaved?: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<DraftPeriod[]>([]);
  const [template, setTemplate] = useState<DraftPeriod[]>([]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOne<{ periods: Period[]; days: number[]; template: DraftPeriod[] }>(
      `/api/v1/timetable/periods?section=${section}`,
      toast.error,
    );
    if (data) {
      setPeriods(data.periods.map(({ id, label, startTime, endTime, kind }) => ({ id, label, startTime, endTime, kind })));
      setDays(data.days);
      setTemplate(data.template);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const update = (i: number, patch: Partial<DraftPeriod>) =>
    setPeriods((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  function addPeriod() {
    const last = periods[periods.length - 1];
    const start = last?.endTime ?? '08:00';
    const [h, m] = start.split(':').map(Number);
    const end = `${String(Math.min(23, h + Math.floor((m + 40) / 60))).padStart(2, '0')}:${String((m + 40) % 60).padStart(2, '0')}`;
    const lessons = periods.filter((p) => p.kind === 'lesson').length;
    setPeriods((ps) => [...ps, { label: `Period ${lessons + 1}`, startTime: start, endTime: end, kind: 'lesson' }]);
  }

  async function save() {
    setSaving(true);
    const res = await submitJson('/api/v1/timetable/periods', 'PUT', { section, periods, days });
    setSaving(false);
    if (res.ok) {
      toast.success('School day saved.');
      await load();
      onSaved?.();
    } else {
      toast.error(res.error!);
    }
  }

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader size={40} />
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-sm font-bold text-primary-900">School days</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={days.includes(d)}
                onChange={(e) => setDays((ds) => (e.target.checked ? [...ds, d].sort() : ds.filter((x) => x !== d)))}
                className="rounded border-[#E5E5E5]"
              />
              {DAY_NAMES[d]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-primary-900">Periods, breaks and lunch</p>
          {periods.length === 0 && template.length > 0 && (
            <Button inline variant="outline" onClick={() => setPeriods(template)}>
              Start from a standard day
            </Button>
          )}
        </div>
        {periods.length === 0 ? (
          <p className="text-sm text-text-muted">No periods yet — start from a standard day, or add them one by one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2 w-28">Starts</th>
                  <th className="py-2 pr-2 w-28">Ends</th>
                  <th className="py-2 pr-2 w-36">Type</th>
                  <th className="py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => (
                  <tr key={p.id ?? `new-${i}`} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-2">
                      <input
                        value={p.label}
                        onChange={(e) => update(i, { label: e.target.value })}
                        className="w-full border border-border rounded-lg px-2 py-1.5"
                        aria-label="Period name"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="time"
                        value={p.startTime}
                        onChange={(e) => update(i, { startTime: e.target.value })}
                        className="w-full border border-border rounded-lg px-2 py-1.5"
                        aria-label="Start time"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="time"
                        value={p.endTime}
                        onChange={(e) => update(i, { endTime: e.target.value })}
                        className="w-full border border-border rounded-lg px-2 py-1.5"
                        aria-label="End time"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={p.kind}
                        onChange={(e) => update(i, { kind: e.target.value as PeriodKind })}
                        className="w-full border border-border rounded-lg px-2 py-1.5"
                        aria-label="Type"
                      >
                        {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => (
                          <option key={k} value={k}>
                            {PERIOD_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setPeriods((ps) => ps.filter((_, j) => j !== i))}
                        aria-label={`Remove ${p.label}`}
                        className="text-text-faint hover:text-error"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button inline variant="outline" onClick={addPeriod}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Add period
          </Button>
          <Button inline onClick={() => void save()} isLoading={saving} disabled={periods.length === 0}>
            Save school day
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-faint">
          Removing a period also removes any lessons timetabled in it.
        </p>
      </div>
    </Card>
  );
}
