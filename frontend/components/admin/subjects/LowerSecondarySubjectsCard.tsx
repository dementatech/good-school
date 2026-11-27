'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';

const OPTIONS: { value: boolean; title: string; body: string; effect: string }[] = [
  {
    value: false,
    title: 'Students choose from S1',
    body: 'Core subjects are added automatically; each student picks their optional subjects.',
    effect:
      'S1 and S2 students will choose their own optional subjects from now on. Subjects they already have are kept — nobody loses a subject.',
  },
  {
    value: true,
    title: 'S1 and S2 take every subject',
    body: 'Every S1/S2 student is registered for all subjects you offer. Students choose from S3.',
    effect:
      'EVERY S1 and S2 student will immediately be registered for EVERY O-Level subject the school offers. They will appear on all of those mark sheets and report cards, and the change applies to the whole school at once.',
  },
];

const CONFIRM_WORD = 'CONFIRM';

/**
 * Whether S1 and S2 students take every offered O-Level subject or choose
 * their optional ones from the start. Core subjects are added either way.
 *
 * Switching it re-registers subjects for every S1/S2 student in the school,
 * so it lives under My School → Advanced settings (not on the everyday
 * Subjects page) and a change needs the admin to type CONFIRM after reading
 * what will happen.
 */
export function LowerSecondarySubjectsCard({ onChange }: { onChange?: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    void fetchOne<{ lowerSecondaryAllSubjects: boolean }>('/api/v1/academic/subject-policy', toast.error).then(
      (res) => setCurrent(res?.lowerSecondaryAllSubjects ?? false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ask(value: boolean) {
    setTyped('');
    setPending(value);
  }

  async function save(value: boolean) {
    setSaving(true);
    const res = await submitJson('/api/v1/academic/subject-policy', 'PUT', { lowerSecondaryAllSubjects: value });
    setSaving(false);
    setPending(null);
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
  const chosen = OPTIONS.find((o) => o.value === pending);

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-primary-900">Subjects in S1 and S2</h3>
        <p className="text-xs text-text-muted">
          Core subjects are always added. Choose whether S1 and S2 students also take every optional subject you offer.
          Changing this re-registers subjects for every S1 and S2 student in the school.
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
              onClick={() => ask(o.value)}
              aria-pressed={selected}
              className={`text-left border p-3 transition-colors ${
                selected ? 'border-primary-700 bg-primary-50' : 'border-border hover:border-primary-700'
              }`}
            >
              <span className="block text-sm font-semibold text-primary-900">
                {o.title}
                {selected && <span className="ml-1.5 text-xs font-normal text-primary-700">(current)</span>}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">{o.body}</span>
            </button>
          );
        })}
      </div>

      <Modal open={chosen !== undefined} onClose={() => !saving && setPending(null)} title="Change S1 and S2 subjects?">
        {chosen && (
          <div className="space-y-4">
            <div className="flex gap-3 border border-warning bg-warning-bg p-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-warning" aria-hidden />
              <div className="text-sm text-text-primary space-y-1">
                <p className="font-bold">Switching to: {chosen.title}</p>
                <p>{chosen.effect}</p>
                <p>Only continue if you are sure. If unsure, ask the Director of Studies first.</p>
              </div>
            </div>
            <label className="block text-sm text-text-primary">
              Type <span className="font-bold">{CONFIRM_WORD}</span> to continue
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1 block w-full border-2 border-border bg-white px-3 py-2 text-sm focus:border-primary-700 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPending(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => void save(chosen.value)}
                isLoading={saving}
                disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}
              >
                Change for every S1 and S2 student
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
