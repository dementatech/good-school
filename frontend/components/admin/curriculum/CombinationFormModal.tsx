'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { submitJson, type Combination, type Subject } from './types';

// docs/design/subject-selection-module.md §3.1/§3.3: core (principal) subjects
// and the one subsidiary are picked separately, and General Paper is never a
// pick — it's automatic for every A-Level student. Code and name are
// system-assigned (C001, "PhyChemMath/ICT/GP") unless explicitly overridden.
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
  const [coreIds, setCoreIds] = useState<string[]>(
    initial?.subjects.filter((m) => m.role === 'principal').map((m) => m.subjectId) ?? [],
  );
  const [subsidiaryId, setSubsidiaryId] = useState(
    initial?.subjects.find((m) => m.role === 'subsidiary')?.subjectId ?? '',
  );
  const [overrideName, setOverrideName] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);

  // Core (principal) picks come from Science/Art — General Paper is never
  // among them (it's category 'subsidiary'). The subsidiary pick comes from
  // 'subsidiary'-category subjects, minus GP itself (automatic, never a pick).
  const coreOptions = subjects.filter((s) => s.category === 'science' || s.category === 'art');
  const subsidiaryOptions = subjects.filter((s) => s.category === 'subsidiary' && !s.isGeneralPaper);
  const allPickable = [...coreOptions, ...subsidiaryOptions];
  const subjectById = useMemo(() => Object.fromEntries(allPickable.map((s) => [s.id, s])), [allPickable]);

  const preview = useMemo(() => {
    const coreNames = coreIds.map((id) => subjectById[id]?.shortName ?? '').join('');
    const subsidiaryName = subsidiaryId ? subjectById[subsidiaryId]?.shortName : '';
    return `${coreNames || 'Combination'}${subsidiaryName ? `/${subsidiaryName}` : ''}/GP`;
  }, [coreIds, subsidiaryId, subjectById]);

  function toggleCore(id: string) {
    setCoreIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
    if (subsidiaryId === id) setSubsidiaryId('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (coreIds.length === 0) {
      toast.error('Choose at least one core subject.');
      return;
    }
    setSaving(true);
    const members = [
      ...coreIds.map((subjectId) => ({ subjectId, role: 'principal' as const })),
      ...(subsidiaryId ? [{ subjectId: subsidiaryId, role: 'subsidiary' as const }] : []),
    ];
    const payload = {
      name: overrideName ? name.trim() || undefined : undefined,
      description: description.trim() || null,
      subjects: members,
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
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">Core subjects</p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {coreOptions.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm border ${
                  coreIds.includes(s.id)
                    ? 'bg-primary-700 text-white border-primary-700'
                    : 'border-border text-text-secondary'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={coreIds.includes(s.id)}
                  onChange={() => toggleCore(s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
          {coreIds.length === 0 && (
            <p className="text-xs text-[#C26565] mt-1.5">Choose at least one core subject.</p>
          )}
        </div>

        <Select
          label="Subsidiary subject (optional)"
          value={subsidiaryId}
          onChange={(e) => setSubsidiaryId(e.target.value)}
          options={[
            { value: '', label: 'None' },
            ...subsidiaryOptions.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />

        <div className="rounded-lg bg-[#FAFAFA] px-3 py-2 text-sm">
          <span className="text-text-faint">Name and code are assigned automatically — </span>
          <span className="font-medium">{preview}</span>
        </div>

        {initial && (
          <div>
            <label className="flex items-center gap-2 text-sm text-[#12333F] mb-1.5">
              <input
                type="checkbox"
                checked={overrideName}
                onChange={(e) => setOverrideName(e.target.checked)}
                className="rounded border-[#E5E5E5]"
              />
              Override the name
            </label>
            {overrideName && (
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={preview} />
            )}
          </div>
        )}

        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving} disabled={coreIds.length === 0}>
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
