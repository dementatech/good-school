'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import type { CatalogCombination, SchoolCombination, SubjectOffering } from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

// docs/design/subject-selection-module.md §3.2b: lead with picking from the
// national catalog (finite, known, pre-tagged) — a build-your-own picker is
// the secondary path, for the minority of schools running a non-standard
// bundle, not the default. Core (principal) subjects and the one subsidiary
// are picked separately, and General Paper is never a pick — it's automatic
// for every A-Level student. Code and name are system-assigned unless
// explicitly overridden.
export function SchoolCombinationFormModal({
  open,
  onClose,
  onSaved,
  academicYearId,
  curriculumId,
  combination,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  academicYearId: string;
  curriculumId: string;
  /** Present to edit an existing school combination's offer/members. */
  combination?: SchoolCombination;
}) {
  const toast = useToast();
  const isEdit = Boolean(combination);
  const [mode, setMode] = useState<'catalog' | 'custom'>(isEdit ? 'custom' : 'catalog');

  const [catalog, setCatalog] = useState<CatalogCombination[]>([]);
  const [catalogId, setCatalogId] = useState('');

  const [offeredSubjects, setOfferedSubjects] = useState<SubjectOffering[]>([]);
  const [coreIds, setCoreIds] = useState<string[]>(
    combination?.subjects.filter((s) => s.role === 'principal').map((s) => s.subjectId) ?? [],
  );
  const [subsidiaryId, setSubsidiaryId] = useState(
    combination?.subjects.find((s) => s.role === 'subsidiary')?.subjectId ?? '',
  );
  const [overrideName, setOverrideName] = useState(false);
  const [name, setName] = useState(combination?.name ?? '');
  const [description, setDescription] = useState(combination?.description ?? '');
  const [minClassSize, setMinClassSize] = useState(combination?.minClassSize?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) return;
    void fetchList<CatalogCombination>(`/api/v1/academic/combinations?curriculumId=${curriculumId}`).then(
      setCatalog,
    );
  }, [curriculumId, isEdit]);

  useEffect(() => {
    void fetchList<SubjectOffering>(
      `/api/v1/academic/subject-offerings?academicYearId=${academicYearId}&phase=A_LEVEL`,
    ).then((rows) => setOfferedSubjects(rows.filter((r) => r.isOffered)));
  }, [academicYearId]);

  const offeringById = useMemo(
    () => Object.fromEntries(offeredSubjects.map((s) => [s.subjectId, s])),
    [offeredSubjects],
  );

  // Core (principal) picks come from Science/Art — General Paper is never
  // among them (it's category 'subsidiary'). The subsidiary pick comes from
  // 'subsidiary'-category subjects, minus GP itself (automatic, never a pick).
  const coreOptions = offeredSubjects.filter((s) => s.subjectCategory === 'science' || s.subjectCategory === 'art');
  const subsidiaryOptions = offeredSubjects.filter(
    (s) => s.subjectCategory === 'subsidiary' && !s.subjectIsGeneralPaper,
  );

  const preview = useMemo(() => {
    const coreNames = coreIds.map((id) => offeringById[id]?.subjectShortName ?? '').join('');
    const subsidiaryName = subsidiaryId ? offeringById[subsidiaryId]?.subjectShortName : '';
    return `${coreNames || 'Combination'}${subsidiaryName ? `/${subsidiaryName}` : ''}/GP`;
  }, [coreIds, subsidiaryId, offeringById]);

  function toggleCore(id: string) {
    setCoreIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
    if (subsidiaryId === id) setSubsidiaryId('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'custom' && coreIds.length === 0) {
      toast.error('Choose at least one core subject.');
      return;
    }
    setSaving(true);

    const body =
      mode === 'catalog' && !isEdit
        ? { catalogCombinationId: catalogId }
        : {
            name: overrideName ? name.trim() || undefined : undefined,
            description: description.trim() || null,
            minClassSize: minClassSize ? Number(minClassSize) : null,
            subjects: [
              ...coreIds.map((subjectId) => ({ subjectId, role: 'principal' as const })),
              ...(subsidiaryId ? [{ subjectId: subsidiaryId, role: 'subsidiary' as const }] : []),
            ],
          };

    const res = isEdit
      ? await submitJson(`/api/v1/academic/school-combinations/${combination!.id}`, 'PATCH', body)
      : await submitJson(`/api/v1/academic/school-combinations?academicYearId=${academicYearId}`, 'POST', body);

    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? 'Combination updated.' : 'Combination added.');
      await onSaved();
      onClose();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${combination!.code}` : 'Add a combination'} size="lg">
      <form onSubmit={submit} className="space-y-6">
        {!isEdit && (
          <div className="flex gap-2">
            <Button type="button" variant={mode === 'catalog' ? 'primary' : 'outline'} inline onClick={() => setMode('catalog')}>
              From the national catalog
            </Button>
            <Button type="button" variant={mode === 'custom' ? 'primary' : 'outline'} inline onClick={() => setMode('custom')}>
              Define a custom combination
            </Button>
          </div>
        )}

        {mode === 'catalog' && !isEdit ? (
          <Section title="Catalog combination">
            <Select
              label="Combination"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              options={[
                { value: '', label: catalog.length ? 'Select a combination…' : 'No combinations in the catalog yet' },
                ...catalog.map((c) => ({
                  value: c.id,
                  label: `${c.code} — ${c.name}`,
                })),
              ]}
            />
            <p className="text-xs text-text-faint">
              Subjects and roles are copied in from the catalog — you can still tweak them here afterward.
            </p>
          </Section>
        ) : (
          <>
            <Section title="Core subjects">
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {coreOptions.length === 0 && (
                  <p className="text-xs text-text-faint">No Science/Art A-Level subjects offered yet — set those up first.</p>
                )}
                {coreOptions.map((s) => (
                  <label
                    key={s.subjectId}
                    className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm border ${
                      coreIds.includes(s.subjectId)
                        ? 'bg-primary-700 text-white border-primary-700'
                        : 'border-border text-text-secondary'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={coreIds.includes(s.subjectId)}
                      onChange={() => toggleCore(s.subjectId)}
                    />
                    {s.subjectName}
                  </label>
                ))}
              </div>
              {mode === 'custom' && coreIds.length === 0 && (
                <p className="text-xs text-[#C26565]">Choose at least one core subject.</p>
              )}
            </Section>

            <Section title="Subsidiary subject">
              <Select
                label="Subsidiary (optional)"
                value={subsidiaryId}
                onChange={(e) => setSubsidiaryId(e.target.value)}
                options={[
                  { value: '', label: 'None' },
                  ...subsidiaryOptions.map((s) => ({ value: s.subjectId, label: s.subjectName })),
                ]}
              />
            </Section>

            <Section title="Identity">
              <div className="rounded-lg bg-[#FAFAFA] px-3 py-2 text-sm">
                <span className="text-text-faint">Name and code are assigned automatically — </span>
                <span className="font-medium">{preview}</span>
              </div>
              {isEdit && (
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
              <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input
                label="Minimum class size (optional)"
                type="number"
                min={1}
                value={minClassSize}
                onChange={(e) => setMinClassSize(e.target.value)}
              />
            </Section>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" isLoading={saving}>
            {isEdit ? 'Save changes' : 'Add combination'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
