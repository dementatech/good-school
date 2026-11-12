'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';

const OPTIONS: { value: boolean; title: string; body: string }[] = [
  {
    value: false,
    title: 'Students choose from S1',
    body: 'Core subjects are added automatically; each student picks their optional subjects.',
  },
  {
    value: true,
    title: 'S1 and S2 take every subject',
    body: 'Every S1/S2 student is registered for all subjects you offer. Students choose from S3.',
  },
];

/**
 * Whether S1 and S2 students take every offered O-Level subject or choose
 * their optional ones from the start. Core subjects are added either way.
 * Calls `onChange` after a save so the page can refresh what depends on it.
 */
export function LowerSecondarySubjectsCard({ onChange }: { onChange?: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchOne<{ lowerSecondaryAllSubjects: boolean }>('/api/v1/academic/subject-policy', toast.error).then(
      (res) => setCurrent(res?.lowerSecondaryAllSubjects ?? false),
    );
  }, []);

  async function save(value: boolean) {
    setSaving(true);
    const res = await submitJson('/api/v1/academic/subject-policy', 'PUT', { lowerSecondaryAllSubjects: value });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    setCurrent(value);
    toast.success(
      value
        ? 'S1 and S2 students are now registered for every subject you offer.'
        : 'S1 and S2 students now choose their optional subjects. Nobody lost a subject.',
    );
    onChange?.();
  }

  if (current === null) return null;

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-primary-900">Subjects in S1 and S2</h3>
        <p className="text-xs text-text-muted">
          Core subjects are always added. Choose whether S1 and S2 students also take every optional subject you offer.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const selected = o.value === current;
          return (
            <button
              key={String(o.value)}
              type="button"
              disabled={saving || selected}
              onClick={() => void save(o.value)}
              aria-pressed={selected}
              className={`text-left rounded-xl border p-3 transition-colors ${
                selected ? 'border-primary-700 bg-primary-50' : 'border-border hover:border-primary-700'
              }`}
            >
              <span className="block text-sm font-semibold text-primary-900">
                {o.title}
                {!o.value && <span className="ml-1.5 text-xs font-normal text-text-faint">(default)</span>}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">{o.body}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
