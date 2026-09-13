'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { Plus, Trash2 } from 'lucide-react';
import { submitJson, type GradeBand, type GradeRoleScope, type GradingAppliesTo } from './types';

/** Same shape as GradingSchemeFormModal's BandDraft — pct fields stay text
 * so "" / "7." don't fight the input while typing. */
interface BandDraft {
  label: string;
  minPct: string;
  maxPct: string;
  points: string;
  legacyEquivalent: string;
  comment: string;
}

const toDraft = (b: GradeBand): BandDraft => ({
  label: b.label,
  minPct: String(b.minPct),
  maxPct: String(b.maxPct),
  points: b.points === null ? '' : String(b.points),
  legacyEquivalent: b.legacyEquivalent ?? '',
  comment: b.comment,
});

/** Sorted by minPct, checks each band touches the next at hundredths (no gap,
 * no overlap) and the set spans 0-100 — mirrors assertBandsValid on the
 * backend, same as GradingSchemeFormModal. */
function coverageIssue(bands: BandDraft[]): string | null {
  const parsed = bands
    .map((b) => ({ label: b.label || '?', min: Number(b.minPct), max: Number(b.maxPct) }))
    .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max));
  if (parsed.length !== bands.length) return 'Every band needs a min and max.';
  const sorted = [...parsed].sort((a, b) => a.min - b.min);
  if (sorted[0]?.min !== 0) return 'Bands must start at 0%.';
  if (sorted[sorted.length - 1]?.max !== 100) return 'Bands must reach 100%.';
  for (let i = 1; i < sorted.length; i++) {
    const expected = Math.round((sorted[i - 1].max + 0.01) * 100) / 100;
    if (sorted[i].min !== expected) {
      return `"${sorted[i - 1].label}" and "${sorted[i].label}" leave a gap or overlap — "${sorted[i].label}" should start at ${expected}%.`;
    }
  }
  return null;
}

export function EditGradingRangesModal({
  open,
  onClose,
  onSaved,
  appliesTo,
  roleScope,
  currentBands,
  cardTitle,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  appliesTo: GradingAppliesTo;
  roleScope: GradeRoleScope;
  currentBands: GradeBand[];
  cardTitle: string;
}) {
  const toast = useToast();
  const [bands, setBands] = useState<BandDraft[]>(currentBands.map(toDraft));
  const [saving, setSaving] = useState(false);

  const issue = coverageIssue(bands);

  function updateBand(i: number, patch: Partial<BandDraft>) {
    setBands((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addBand() {
    setBands((bs) => [...bs, { label: '', minPct: '', maxPct: '', points: '', legacyEquivalent: '', comment: '' }]);
  }
  function removeBand(i: number) {
    setBands((bs) => bs.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (bands.some((b) => !b.label.trim())) {
      toast.error('Every band needs a label.');
      return;
    }
    if (bands.some((b) => !b.comment.trim())) {
      toast.error('Every band needs a comment — it shows on the report card.');
      return;
    }
    if (issue) {
      toast.error(issue);
      return;
    }
    setSaving(true);
    const res = await submitJson('/api/v1/academic/school-grading-schemes/ranges', 'PUT', {
      appliesTo,
      roleScope,
      bands: bands.map((b) => ({
        label: b.label.trim(),
        minPct: Number(b.minPct),
        maxPct: Number(b.maxPct),
        points: b.points.trim() === '' ? null : Number(b.points),
        legacyEquivalent: b.legacyEquivalent.trim() || null,
        comment: b.comment.trim(),
      })),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Your ranges are saved — this only affects your school.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit my ranges — ${cardTitle}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-text-faint">
          Adjusting these saves your own copy — the platform default and every other school stay
          unchanged.
        </p>

        <div className="space-y-2">
          {bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Label (A)"
                value={b.label}
                onChange={(e) => updateBand(i, { label: e.target.value })}
                className="w-20 border border-border rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="80"
                  value={b.minPct}
                  onChange={(e) => updateBand(i, { minPct: e.target.value })}
                  className="w-20 border border-border rounded-lg px-2.5 py-1.5 text-sm"
                />
                <span className="text-sm text-text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="100"
                  value={b.maxPct}
                  onChange={(e) => updateBand(i, { maxPct: e.target.value })}
                  className="w-20 border border-border rounded-lg px-2.5 py-1.5 text-sm"
                />
                <span className="text-sm text-text-muted">%</span>
              </div>
              <input
                type="number"
                placeholder="Points"
                value={b.points}
                onChange={(e) => updateBand(i, { points: e.target.value })}
                className="w-20 border border-border rounded-lg px-2.5 py-1.5 text-sm"
              />
              <input
                placeholder="Comment (Excellent)"
                value={b.comment}
                onChange={(e) => updateBand(i, { comment: e.target.value })}
                className="flex-1 min-w-[8rem] border border-border rounded-lg px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeBand(i)}
                disabled={bands.length <= 1}
                className="p-1.5 text-text-muted hover:text-error disabled:opacity-30 disabled:hover:text-text-muted"
                aria-label="Remove band"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addBand}
              className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add band
            </button>
            <span className={`text-xs ${issue ? 'text-error' : 'text-text-muted'}`}>
              {issue ?? 'Covers 0–100% with no gaps.'}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            Save my ranges
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
