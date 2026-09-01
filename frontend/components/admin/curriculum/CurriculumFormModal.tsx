'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, type Curriculum } from './types';

export function CurriculumFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  initial?: Curriculum;
}) {
  const toast = useToast();
  // The modal is mounted only while open, so initialising from `initial` here
  // is enough — no effect needed to re-sync.
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    awardingBody: initial?.awardingBody ?? '',
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      awardingBody: form.awardingBody.trim() || null,
      isActive: form.isActive,
    };
    const res = initial
      ? await submitJson(`/api/v1/academic/curricula/${initial.id}`, 'PATCH', payload)
      : await submitJson('/api/v1/academic/curricula', 'POST', payload);
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Curriculum updated.' : 'Curriculum added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.code}` : 'Add curriculum'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Code"
            placeholder="UNEB"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
          <Input
            label="Name"
            placeholder="Uganda National Curriculum"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <Input
          label="Awarding body (optional)"
          placeholder="Uganda National Examinations Board"
          value={form.awardingBody}
          onChange={(e) => setForm({ ...form, awardingBody: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded border-[#E5E5E5]"
          />
          Active
        </label>
        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add curriculum'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
