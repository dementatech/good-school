'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { combinationDisplayName } from '@/lib/combination-name';
import { PRINCIPALS_PER_COMBINATION } from '@/lib/uneb';
import { submitJson, type Combination, type Subject } from './types';
import { SubsidiaryRuleField, effectiveSubsidiaryIds } from './SubsidiaryRuleField';

// docs/design/subject-selection-module.md §3.1/§3.3: exactly 3 principal
// subjects, then the subsidiary the UNEB rule calls for (lib/uneb.ts) — or,
// where the student may choose, the options on offer. General Paper is never
// a pick — it's automatic for every A-Level student. Code is system-assigned
// (C001, ...). The NAME is not editable — it's derived from the member
// subjects on every read, so it always tracks their current names/short names.
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
  const [subsidiaryIds, setSubsidiaryIds] = useState<string[]>(
    initial?.subjects.filter((m) => m.role === 'subsidiary').map((m) => m.subjectId) ?? [],
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);

  // Core (principal) picks come from Science/Art — General Paper is never
  // among them (it's category 'subsidiary'). The subsidiary pick comes from
  // 'subsidiary'-category subjects, minus GP itself (automatic, never a pick).
  const coreOptions = useMemo(
    () => subjects.filter((s) => s.category === 'science' || s.category === 'art'),
    [subjects],
  );
  const subsidiaryOptions = useMemo(
    () => subjects.filter((s) => s.category === 'subsidiary' && !s.isGeneralPaper),
    [subjects],
  );
  const subjectById = useMemo(
    () => Object.fromEntries([...coreOptions, ...subsidiaryOptions].map((s) => [s.id, s])),
    [coreOptions, subsidiaryOptions],
  );

  const principalCodes = coreIds.map((id) => subjectById[id]?.unebCode ?? null);
  const ruleOptions = subsidiaryOptions.map((s) => ({ id: s.id, name: s.name, unebCode: s.unebCode }));
  const chosenSubsidiaries = effectiveSubsidiaryIds(principalCodes, ruleOptions, subsidiaryIds);
  const coreCountOk = coreIds.length === PRINCIPALS_PER_COMBINATION;

  const preview = useMemo(
    () =>
      combinationDisplayName(
        coreIds.map((id) => subjectById[id]?.name ?? ''),
        chosenSubsidiaries.map((id) => subjectById[id]?.shortName ?? ''),
      ),
    [coreIds, chosenSubsidiaries, subjectById],
  );

  function toggleCore(id: string) {
    setCoreIds((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : ids.length < PRINCIPALS_PER_COMBINATION ? [...ids, id] : ids,
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!coreCountOk) {
      toast.error(`Choose exactly ${PRINCIPALS_PER_COMBINATION} principal subjects.`);
      return;
    }
    setSaving(true);
    const members = [
      ...coreIds.map((subjectId) => ({ subjectId, role: 'principal' as const })),
      ...chosenSubsidiaries.map((subjectId) => ({ subjectId, role: 'subsidiary' as const })),
    ];
    const payload = {
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
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">
            Principal subjects ({coreIds.length}/{PRINCIPALS_PER_COMBINATION})
          </p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {coreOptions.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm border ${
                  coreIds.includes(s.id)
                    ? 'bg-primary-700 text-white border-primary-700'
                    : coreCountOk
                      ? 'border-border text-text-faint opacity-50'
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
          {!coreCountOk && (
            <p className="text-xs text-[#C26565] mt-1.5">
              Choose exactly {PRINCIPALS_PER_COMBINATION} principal subjects.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted tracking-wide mb-1.5">Subsidiary</p>
          <SubsidiaryRuleField
            principalCount={coreIds.length}
            principalCodes={principalCodes}
            options={ruleOptions}
            value={subsidiaryIds}
            onChange={setSubsidiaryIds}
            missingRequiredHint="No subject in this curriculum has that UNEB code yet — set it on the subsidiary subject first."
          />
        </div>

        <div className="rounded-lg bg-bg-subtle px-3 py-2 text-sm">
          <span className="text-text-faint">
            Code is assigned automatically. The name follows the subjects —{' '}
          </span>
          <span className="font-medium">{preview}</span>
        </div>

        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving} disabled={!coreCountOk}>
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
