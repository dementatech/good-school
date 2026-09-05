'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastProvider';
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
} from './types';

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
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const payload = {
      phase,
      shortName: form.shortName.trim(),
      name: form.name.trim(),
      category: form.category,
      isExaminable: form.isExaminable,
      isActive: form.isActive,
      stageIds: form.stageIds,
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
