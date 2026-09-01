'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, type Stage } from './types';

export function StageFormModal({
  open,
  onClose,
  onSaved,
  curriculumId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  curriculumId: string;
  initial?: Stage;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    sequenceNumber: initial?.sequenceNumber ?? 1,
    phase: initial?.phase ?? 'O_LEVEL',
    ageEquivalentYears:
      initial?.ageEquivalentYears != null ? String(initial.ageEquivalentYears) : '',
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      sequenceNumber: Number(form.sequenceNumber),
      phase: form.phase,
      ageEquivalentYears: form.ageEquivalentYears ? Number(form.ageEquivalentYears) : null,
    };
    const res = initial
      ? await submitJson(`/api/v1/academic/stages/${initial.id}`, 'PATCH', payload)
      : await submitJson(`/api/v1/academic/curricula/${curriculumId}/stages`, 'POST', payload);
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Stage updated.' : 'Stage added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.code}` : 'Add stage'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Code"
            placeholder="S1"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label="Name"
            placeholder="Senior 1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Sequence"
            type="number"
            min={1}
            value={form.sequenceNumber}
            onChange={(e) => setForm({ ...form, sequenceNumber: Number(e.target.value) })}
            required
          />
          <div>
            <label className="block text-xs font-medium text-text-muted tracking-wide mb-1">
              Phase
            </label>
            <select
              value={form.phase}
              onChange={(e) => setForm({ ...form, phase: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="O_LEVEL">O-Level</option>
              <option value="A_LEVEL">A-Level</option>
            </select>
          </div>
          <Input
            label="Typical age"
            type="number"
            min={1}
            value={form.ageEquivalentYears}
            onChange={(e) => setForm({ ...form, ageEquivalentYears: e.target.value })}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add stage'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
