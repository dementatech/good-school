'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
import { Plus, Trash2 } from 'lucide-react';
import {
  CATEGORY_LABEL,
  PHASE_LABEL,
  PHASE_RANGE,
  STATUS_LABEL,
  STATUS_VARIANT,
  submitJson,
  type Phase,
  type Stage,
  type Subject,
  type SubjectCategory,
  type SubjectVariant,
} from './types';

/** A variant row mid-edit — contributionPercent stays text so "" / "7." don't
 * fight the input while typing; parsed to a number only on submit. */
interface VariantDraft {
  name: string;
  code: string;
  contribution: string;
}

const toDraft = (v: SubjectVariant): VariantDraft => ({
  name: v.name,
  code: v.code,
  contribution: String(v.contributionPercent),
});

export function SubjectFormModal({
  open,
  onClose,
  onSaved,
  curriculumId,
  phase,
  stages,
  /** Scoped by the caller — the full phase list for a super_admin, or that
   * list minus core/general for a school proposing its own subject. */
  categories,
  initial,
  /** True when a school (not a super_admin) is proposing this subject — it
   * won't be usable until a super_admin approves it. Changes the success
   * message only; the approval itself happens server-side. */
  isProposal = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  curriculumId: string;
  phase: Phase;
  /** Already scoped to `phase` by the caller. */
  stages: Stage[];
  categories: SubjectCategory[];
  initial?: Subject;
  isProposal?: boolean;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    shortName: initial?.shortName ?? '',
    name: initial?.name ?? '',
    category: (initial?.category ?? categories[0]) as SubjectCategory,
    isExaminable: initial?.isExaminable ?? true,
    isActive: initial?.isActive ?? true,
    stageIds: initial?.stageIds ?? ([] as string[]),
  });
  const [hasVariant, setHasVariant] = useState(initial?.hasVariant ?? false);
  const [variants, setVariants] = useState<VariantDraft[]>(
    initial?.variants.length ? initial.variants.map(toDraft) : [
      { name: '', code: '', contribution: '' },
      { name: '', code: '', contribution: '' },
    ],
  );
  const [saving, setSaving] = useState(false);

  const variantSum = variants.reduce((n, v) => n + (Number(v.contribution) || 0), 0);
  const variantSumOk = Math.round(variantSum * 100) === 10000;

  function updateVariant(i: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function addVariant() {
    setVariants((vs) => [...vs, { name: '', code: '', contribution: '' }]);
  }
  function removeVariant(i: number) {
    setVariants((vs) => vs.filter((_, idx) => idx !== i));
  }

  // A subject saved under an older rule set can carry a category no longer in
  // `categories` (e.g. legacy data) — keep it selectable on edit rather than
  // silently defaulting away from it.
  const categoryOptions =
    initial && !categories.includes(initial.category) ? [initial.category, ...categories] : categories;

  function toggleStage(id: string) {
    setForm((f) => ({
      ...f,
      stageIds: f.stageIds.includes(id)
        ? f.stageIds.filter((s) => s !== id)
        : [...f.stageIds, id],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hasVariant) {
      if (variants.length < 2) {
        toast.error('A subject with variants needs at least two.');
        return;
      }
      if (variants.some((v) => !v.name.trim() || !v.code.trim())) {
        toast.error('Every variant needs a name and a code.');
        return;
      }
      if (!variantSumOk) {
        toast.error(`Variant contributions must add up to 100% (currently ${variantSum}%).`);
        return;
      }
    }
    setSaving(true);
    const payload = {
      phase,
      shortName: form.shortName.trim(),
      name: form.name.trim(),
      category: form.category,
      isExaminable: form.isExaminable,
      isActive: form.isActive,
      stageIds: form.stageIds,
      hasVariant,
      variants: hasVariant
        ? variants.map((v) => ({
            name: v.name.trim(),
            code: v.code.trim(),
            contributionPercent: Number(v.contribution),
          }))
        : [],
    };
    const res = initial
      ? await submitJson(`/api/v1/academic/subjects/${initial.id}`, 'PATCH', payload)
      : await submitJson(
          `/api/v1/academic/subjects?curriculumId=${curriculumId}`,
          'POST',
          payload,
        );
    setSaving(false);
    if (res.ok) {
      toast.success(
        initial
          ? 'Subject updated.'
          : isProposal
            ? `${PHASE_LABEL[phase]} subject submitted for approval.`
            : `${PHASE_LABEL[phase]} subject added.`,
      );
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initial
          ? `Edit ${initial.name}`
          : `Add ${PHASE_LABEL[phase]} subject (${PHASE_RANGE[phase]})`
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {initial && (
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[initial.status]}>{STATUS_LABEL[initial.status]}</Badge>
            {initial.status === 'rejected' && initial.rejectionReason && (
              <span className="text-xs text-text-faint">Reason: {initial.rejectionReason}</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Name"
            placeholder={phase === 'A_LEVEL' ? 'Physics' : 'Mathematics'}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Short name"
            placeholder={phase === 'A_LEVEL' ? 'Phy' : 'Maths'}
            value={form.shortName}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
            required
          />
        </div>

        {initial ? (
          <div>
            <p className="text-xs font-medium text-text-muted tracking-wide mb-1">Code</p>
            <Badge variant="muted">{initial.code}</Badge>
          </div>
        ) : (
          <p className="text-xs text-text-faint">
            Code will be assigned automatically once saved (S001, S002, …).
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as SubjectCategory })}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={form.isExaminable}
                onChange={(e) => setForm({ ...form, isExaminable: e.target.checked })}
                className="rounded border-[#E5E5E5]"
              />
              Examinable
            </label>
            <label className="flex items-center gap-2 text-sm text-[#12333F]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-[#E5E5E5]"
              />
              Active
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">
            Offered at ({PHASE_RANGE[phase]})
          </p>
          {stages.length === 0 ? (
            <p className="text-xs text-text-muted">
              No {PHASE_LABEL[phase]} stages in this curriculum yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stages.map((s) => (
                <label
                  key={s.id}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs border ${
                    form.stageIds.includes(s.id)
                      ? 'bg-primary-700 text-white border-primary-700'
                      : 'border-border text-text-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.stageIds.includes(s.id)}
                    onChange={() => toggleStage(s.id)}
                  />
                  {s.code}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-[#12333F] mb-2">
            <input
              type="checkbox"
              checked={hasVariant}
              onChange={(e) => setHasVariant(e.target.checked)}
              className="rounded border-[#E5E5E5]"
            />
            Examined as separate papers, merged into one mark
          </label>
          <p className="text-xs text-text-faint mb-2">
            e.g. Theory 70% + Practical 30%. Contributions must add up to 100%.
            {initial && (
              <>
                {' '}
                If this subject already has recorded marks, this configuration is locked — you&apos;ll
                see an error on save.
              </>
            )}
          </p>

          {hasVariant && (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="Name (Theory)"
                    value={v.name}
                    onChange={(e) => updateVariant(i, { name: e.target.value })}
                    className="flex-1 min-w-[7rem] border border-border rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Code"
                    value={v.code}
                    onChange={(e) => updateVariant(i, { code: e.target.value })}
                    className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="70"
                      value={v.contribution}
                      onChange={(e) => updateVariant(i, { contribution: e.target.value })}
                      className="w-16 border border-border rounded-lg px-2.5 py-1.5 text-sm"
                    />
                    <span className="text-sm text-text-muted">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    disabled={variants.length <= 2}
                    className="p-1.5 text-text-muted hover:text-error disabled:opacity-30 disabled:hover:text-text-muted"
                    aria-label="Remove variant"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={addVariant}
                  className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Add variant
                </button>
                <span className={`text-xs ${variantSumOk ? 'text-text-muted' : 'text-error'}`}>
                  Total: {variantSum}%{!variantSumOk && ' (must be 100%)'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add subject'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
