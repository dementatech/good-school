'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import {
  CATEGORIES,
  PHASE_LABEL,
  PHASE_RANGE,
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
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  curriculumId: string;
  phase: Phase;
  /** Already scoped to `phase` by the caller. */
  stages: Stage[];
  initial?: Subject;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    category: (initial?.category ?? 'core') as SubjectCategory,
    isExaminable: initial?.isExaminable ?? true,
    isActive: initial?.isActive ?? true,
    stageIds: initial?.stageIds ?? ([] as string[]),
  });
  const [saving, setSaving] = useState(false);

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
      code: form.code.trim(),
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
      toast.success(initial ? 'Subject updated.' : `${PHASE_LABEL[phase]} subject added.`);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Name"
            placeholder={phase === 'A_LEVEL' ? 'Physics' : 'Mathematics'}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Code"
            placeholder={phase === 'A_LEVEL' ? 'PHY' : 'MTC'}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </div>

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
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
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
