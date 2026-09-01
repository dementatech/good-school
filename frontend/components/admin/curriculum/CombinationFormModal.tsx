'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, type Combination, type Role, type Subject } from './types';

export function CombinationFormModal({
  open,
  onClose,
  onSaved,
  curriculumId,
  subjects,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  curriculumId: string;
  /** A-Level subjects that are offered at a stage — the only ones eligible. */
  subjects: Subject[];
  initial?: Combination;
}) {
  const toast = useToast();
  const [form, setForm] = useState<{
    code: string;
    name: string;
    description: string;
    members: { subjectId: string; role: Role }[];
  }>({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    members: initial?.subjects.map((m) => ({ subjectId: m.subjectId, role: m.role })) ?? [],
  });
  const [saving, setSaving] = useState(false);

  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  const principals = form.members.filter((m) => m.role === 'principal');
  const canSubmit = principals.length > 0 && form.name.trim().length > 0;

  function setRole(subjectId: string, role: Role | '') {
    setForm((f) => ({
      ...f,
      members: role
        ? [...f.members.filter((m) => m.subjectId !== subjectId), { subjectId, role }]
        : f.members.filter((m) => m.subjectId !== subjectId),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (principals.length === 0) {
      toast.error('Choose at least one principal subject.');
      return;
    }
    setSaving(true);
    const code =
      form.code.trim() ||
      principals
        .map((m) => subjectById[m.subjectId]?.code?.[0] ?? '')
        .join('')
        .toUpperCase();
    const payload = {
      code,
      name: form.name.trim(),
      description: form.description.trim() || null,
      subjects: form.members,
    };
    const res = initial
      ? await submitJson(`/api/v1/academic/combinations/${initial.id}`, 'PATCH', payload)
      : await submitJson(
          `/api/v1/academic/combinations?curriculumId=${curriculumId}`,
          'POST',
          payload,
        );
    setSaving(false);
    if (res.ok) {
      toast.success(initial ? 'Combination updated.' : 'Combination added.');
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
      title={initial ? `Edit ${initial.code}` : 'Add A-Level combination'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">
            Subjects and their role
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {subjects.map((s) => {
              const current = form.members.find((m) => m.subjectId === s.id)?.role ?? '';
              return (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="w-48 truncate">{s.name}</span>
                  <select
                    value={current}
                    onChange={(e) => setRole(s.id, e.target.value as Role | '')}
                    className="border border-border rounded-lg px-2 py-1 text-xs"
                  >
                    <option value="">not in this combination</option>
                    <option value="principal">principal</option>
                    <option value="subsidiary">subsidiary</option>
                    <option value="compulsory">compulsory</option>
                  </select>
                </div>
              );
            })}
          </div>
          {principals.length === 0 && (
            <p className="text-xs text-[#C26565] mt-1.5">Choose at least one principal subject.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Code (optional)"
            placeholder="auto: PCM"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            label="Name"
            placeholder="Physics, Chemistry, Maths"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving} disabled={!canSubmit}>
            {initial ? 'Save changes' : 'Add combination'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
