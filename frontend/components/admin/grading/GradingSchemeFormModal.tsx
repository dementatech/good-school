'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Plus, Trash2 } from 'lucide-react';
import {
  APPLIES_TO_LABEL,
  ROLE_SCOPE_LABEL,
  submitJson,
  type GradeBand,
  type GradeRoleScope,
  type GradingAppliesTo,
  type GradingScheme,
} from './types';

/** A band row mid-edit — pct fields stay text so "" / "7." don't fight the
 * input while typing; parsed to a number only on submit. Same precedent as
 * SubjectFormModal's VariantDraft. */
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

const BLANK_BAND: BandDraft = { label: '', minPct: '', maxPct: '', points: '', legacyEquivalent: '', comment: '' };

const ROLE_SCOPES: GradeRoleScope[] = ['principal', 'subsidiary'];

/** Sorted by minPct, checks each band touches the next at hundredths (no gap,
 * no overlap) and the set spans 0-100 — mirrors assertBandsValid on the
 * backend so the form catches the same problem before a round trip. */
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

export function GradingSchemeFormModal({
  open,
  onClose,
  onSaved,
  curriculumId,
  appliesTo,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  /** Used only when creating — schemes are created within a curriculum. */
  curriculumId: string;
  /** Preselects the phase for a new scheme; fixed (shown read-only) on edit. */
  appliesTo: GradingAppliesTo;
  initial?: GradingScheme;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    regime: initial?.regime ?? '',
    appliesTo: initial?.appliesTo ?? appliesTo,
    roleScope: initial?.roleScope ?? (appliesTo === 'A_LEVEL' ? ROLE_SCOPES[0] : 'any'),
    isActive: initial?.isActive ?? true,
  });
  const [bands, setBands] = useState<BandDraft[]>(
    initial?.bands.length ? initial.bands.map(toDraft) : [{ ...BLANK_BAND }],
  );
  const [saving, setSaving] = useState(false);

  const issue = coverageIssue(bands);

  function updateBand(i: number, patch: Partial<BandDraft>) {
    setBands((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function addBand() {
    setBands((bs) => [...bs, { ...BLANK_BAND }]);
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
    if (!form.regime.trim()) {
      toast.error('Give this scheme a regime (e.g. nlsc_a_e, legacy_1_9).');
      return;
    }
    setSaving(true);
    const payload = {
      regime: form.regime.trim(),
      appliesTo: form.appliesTo,
      roleScope: form.appliesTo === 'O_LEVEL' ? 'any' : form.roleScope,
      name: form.name.trim(),
      isActive: form.isActive,
      bands: bands.map((b) => ({
        label: b.label.trim(),
        minPct: Number(b.minPct),
        maxPct: Number(b.maxPct),
        points: b.points.trim() === '' ? null : Number(b.points),
        legacyEquivalent: b.legacyEquivalent.trim() || null,
        comment: b.comment.trim(),
      })),
    };
    const res = initial
      ? await submitJson(`/api/v1/academic/grading-schemes/${initial.id}`, 'PATCH', payload)
      : await submitJson(`/api/v1/academic/grading-schemes?curriculumId=${curriculumId}`, 'POST', payload);
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Grading scheme updated.' : 'Grading scheme added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.name}` : 'Add grading scheme'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Name"
            placeholder="NLSC O-Level"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Regime"
            placeholder="nlsc_a_e"
            value={form.regime}
            onChange={(e) => setForm({ ...form, regime: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="block text-xs font-medium text-text-muted tracking-wide mb-1">Applies to</p>
            {initial ? (
              <Badge variant="muted">{APPLIES_TO_LABEL[form.appliesTo]}</Badge>
            ) : (
              <select
                value={form.appliesTo}
                onChange={(e) => {
                  const next = e.target.value as GradingAppliesTo;
                  setForm({ ...form, appliesTo: next, roleScope: next === 'A_LEVEL' ? ROLE_SCOPES[0] : 'any' });
                }}
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
              >
                {(Object.keys(APPLIES_TO_LABEL) as GradingAppliesTo[]).map((p) => (
                  <option key={p} value={p}>
                    {APPLIES_TO_LABEL[p]}
                  </option>
                ))}
              </select>
            )}
          </div>
          {form.appliesTo === 'A_LEVEL' && (
            <div>
              <p className="block text-xs font-medium text-text-muted tracking-wide mb-1">Subject track</p>
              {initial ? (
                <Badge variant="muted">{ROLE_SCOPE_LABEL[form.roleScope]}</Badge>
              ) : (
                <select
                  value={form.roleScope}
                  onChange={(e) => setForm({ ...form, roleScope: e.target.value as GradeRoleScope })}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
                >
                  {ROLE_SCOPES.map((rs) => (
                    <option key={rs} value={rs}>
                      {ROLE_SCOPE_LABEL[rs]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        {initial && (
          <p className="text-xs text-text-faint -mt-2">
            Phase and subject track are fixed once created — a real change is a new scheme.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded border-[#E5E5E5]"
          />
          Active (offered in the catalog for schools to pick)
        </label>

        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-text-muted tracking-wide mb-2">Bands</p>
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
                  placeholder="Legacy equiv. (D1/D2)"
                  value={b.legacyEquivalent}
                  onChange={(e) => updateBand(i, { legacyEquivalent: e.target.value })}
                  className="w-32 border border-border rounded-lg px-2.5 py-1.5 text-sm"
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
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add scheme'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
