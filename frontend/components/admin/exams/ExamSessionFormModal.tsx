'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, type ExamSession } from './types';

export function ExamSessionFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  initial?: ExamSession;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    examName: initial?.examName ?? '',
    examCode: initial?.examCode ?? '',
    description: initial?.description ?? '',
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      examName: form.examName.trim(),
      examCode: form.examCode.trim(),
      description: form.description.trim() || null,
      isActive: form.isActive,
    };
    const res = initial
      ? await submitJson(`/api/v1/exams/sessions/${initial.id}`, 'PATCH', payload)
      : await submitJson('/api/v1/exams/sessions', 'POST', payload);
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Exam session updated.' : 'Exam session added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.examCode}` : 'Add exam session'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Name"
            placeholder="End of Term Exam"
            value={form.examName}
            onChange={(e) => setForm({ ...form, examName: e.target.value })}
            required
          />
          <Input
            label="Code"
            placeholder="EOT"
            value={form.examCode}
            onChange={(e) => setForm({ ...form, examCode: e.target.value })}
            required
          />
        </div>
        <Input
          label="Description (optional)"
          placeholder="Terminal examination sat at the end of each term"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="rounded border-[#E5E5E5]"
          />
          Active — schools can pick this session
        </label>
        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {initial ? 'Save changes' : 'Add exam session'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
