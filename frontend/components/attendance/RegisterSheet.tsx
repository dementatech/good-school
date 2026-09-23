'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const STATUS_META: Record<AttendanceStatus, { label: string; short: string; chip: string }> = {
  present: { label: 'Present', short: 'P', chip: 'bg-success-bg text-success border-success/40' },
  absent: { label: 'Absent', short: 'A', chip: 'bg-error-bg text-error border-error/40' },
  late: { label: 'Late', short: 'L', chip: 'bg-warning-bg text-warning border-warning/40' },
  excused: { label: 'Excused', short: 'E', chip: 'bg-primary-50 text-primary-700 border-primary-700/30' },
};
const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

interface RegisterPupil {
  studentUserId: string;
  name: string;
  systemId: string | null;
  streamName: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
}
interface Register {
  class: { id: string; name: string };
  date: string;
  term: { id: string; name: string } | null;
  pupils: RegisterPupil[];
  lastUpdatedAt: string | null;
}

type Draft = Record<string, { status: AttendanceStatus | null; reason: string }>;

/**
 * One class's register for one day: a Present / Absent / Late / Excused toggle
 * per pupil, with a reason for anything but Present. "Mark all present" fills
 * every blank, so a teacher only has to touch the exceptions.
 */
export function RegisterSheet({ classId, date, onSaved }: { classId: string; date: string; onSaved?: () => void }) {
  const toast = useToast();
  const [register, setRegister] = useState<Register | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchOne<Register>(`/api/v1/attendance/register?classId=${classId}&date=${date}`, toast.error);
    setRegister(data);
    setDraft(
      Object.fromEntries(
        (data?.pupils ?? []).map((p) => [p.studentUserId, { status: p.status, reason: p.reason ?? '' }]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date]);

  useEffect(() => {
    void (async () => {
      setRegister(null);
      await load();
    })();
  }, [load]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, blank: 0 };
    for (const d of Object.values(draft)) {
      if (d.status) c[d.status]++;
      else c.blank++;
    }
    return c;
  }, [draft]);

  const dirty = useMemo(
    () =>
      (register?.pupils ?? []).some((p) => {
        const d = draft[p.studentUserId];
        return d && (d.status !== p.status || (d.reason || null) !== (p.reason || null));
      }),
    [draft, register],
  );

  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  function markAllPresent() {
    setDraft((d) =>
      Object.fromEntries(Object.entries(d).map(([id, v]) => [id, v.status ? v : { status: 'present', reason: '' }])),
    );
  }

  async function save() {
    if (!register) return;
    setSaving(true);
    const res = await submitJson('/api/v1/attendance/register', 'PUT', {
      classId,
      date,
      entries: register.pupils.map((p) => ({
        studentUserId: p.studentUserId,
        status: draft[p.studentUserId]?.status ?? null,
        reason: draft[p.studentUserId]?.reason?.trim() || null,
      })),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`Register saved for ${register.class.name}.`);
      await load();
      onSaved?.();
    } else {
      toast.error(res.error!);
    }
  }

  if (!register) {
    return (
      <div className="py-10 flex justify-center">
        <Loader size={40} />
      </div>
    );
  }
  if (register.pupils.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">No pupils are enrolled in {register.class.name}.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-semibold text-primary-900">
          {register.class.name}
          {register.term ? <span className="font-normal text-text-muted"> · {register.term.name}</span> : null}
        </span>
        {STATUSES.map((s) => (
          <span key={s} className="text-text-muted">
            {STATUS_META[s].label}: <strong className="text-primary-900 tabular-nums">{counts[s]}</strong>
          </span>
        ))}
        {counts.blank > 0 && (
          <span className="text-warning">
            Not marked: <strong className="tabular-nums">{counts.blank}</strong>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button inline variant="outline" onClick={markAllPresent} disabled={counts.blank === 0}>
            <CheckCheck className="w-4 h-4 mr-1.5" aria-hidden />
            Mark the rest present
          </Button>
          <Button inline onClick={() => void save()} isLoading={saving} disabled={!dirty}>
            <Save className="w-4 h-4 mr-1.5" aria-hidden />
            Save register
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
              <th className="py-2.5 px-4 w-10">#</th>
              <th className="py-2.5 px-2">Pupil</th>
              <th className="py-2.5 px-2">Mark</th>
              <th className="py-2.5 px-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {register.pupils.map((p, i) => {
              const d = draft[p.studentUserId] ?? { status: null, reason: '' };
              return (
                <tr key={p.studentUserId} className="border-b border-border last:border-0">
                  <td className="py-1.5 px-4 text-text-faint tabular-nums">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <span className="block font-medium text-primary-900">{p.name}</span>
                    <span className="block text-[11px] text-text-faint">
                      {p.systemId}
                      {p.streamName ? ` · ${p.streamName}` : ''}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="inline-flex gap-1" role="radiogroup" aria-label={`${p.name}'s attendance`}>
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={d.status === s}
                          title={STATUS_META[s].label}
                          onClick={() => set(p.studentUserId, { status: d.status === s ? null : s })}
                          className={`w-9 h-8 rounded-md border text-xs font-extrabold ${
                            d.status === s ? STATUS_META[s].chip : 'border-border text-text-faint hover:text-primary-900'
                          }`}
                        >
                          {STATUS_META[s].short}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5 px-4">
                    {d.status && d.status !== 'present' && (
                      <input
                        value={d.reason}
                        onChange={(e) => set(p.studentUserId, { reason: e.target.value })}
                        placeholder="e.g. Sick, travelled"
                        maxLength={300}
                        className="w-full border border-border rounded-lg px-2 py-1 text-sm"
                        aria-label={`Reason for ${p.name}`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
