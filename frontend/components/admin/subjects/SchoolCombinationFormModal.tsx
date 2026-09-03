'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Plus, Trash2 } from 'lucide-react';
import type { CatalogCombination, CombinationRole, SchoolCombination, SubjectOffering } from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-widest text-text-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

interface MemberRow {
  subjectId: string;
  role: CombinationRole;
}

// docs/design/subject-selection-module.md §3.2b: lead with picking from the
// national catalog (finite, known, pre-tagged) — a build-your-own picker is
// the secondary path, for the minority of schools running a non-standard
// bundle, not the default.
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
  const [name, setName] = useState(combination?.name ?? '');
  const [code, setCode] = useState(combination?.code ?? '');
  const [description, setDescription] = useState(combination?.description ?? '');
  const [minClassSize, setMinClassSize] = useState(combination?.minClassSize?.toString() ?? '');
  const [members, setMembers] = useState<MemberRow[]>(
    combination?.subjects.map((s) => ({ subjectId: s.subjectId, role: s.role })) ?? [
      { subjectId: '', role: 'principal' },
    ],
  );
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

  function updateMember(i: number, patch: Partial<MemberRow>) {
    setMembers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body =
      mode === 'catalog' && !isEdit
        ? { catalogCombinationId: catalogId }
        : {
            name: name.trim(),
            code: code.trim() || undefined,
            description: description.trim() || null,
            minClassSize: minClassSize ? Number(minClassSize) : null,
            subjects: members.filter((m) => m.subjectId).map((m) => ({ subjectId: m.subjectId, role: m.role })),
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
            <Section title="Identity">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input label="Code (optional — derived if blank)" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input
                label="Minimum class size (optional)"
                type="number"
                min={1}
                value={minClassSize}
                onChange={(e) => setMinClassSize(e.target.value)}
              />
            </Section>

            <Section title="Subjects">
              <div className="space-y-3">
                {members.map((m, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select
                        label={i === 0 ? 'Subject' : undefined}
                        value={m.subjectId}
                        onChange={(e) => updateMember(i, { subjectId: e.target.value })}
                        options={[
                          { value: '', label: offeredSubjects.length ? 'Select a subject…' : 'No A-Level subjects offered yet — set those up first' },
                          ...offeredSubjects.map((s) => ({ value: s.subjectId, label: `${s.subjectCode} — ${s.subjectName}` })),
                        ]}
                      />
                    </div>
                    <div className="w-40">
                      <Select
                        label={i === 0 ? 'Role' : undefined}
                        value={m.role}
                        onChange={(e) => updateMember(i, { role: e.target.value as CombinationRole })}
                        options={[
                          { value: 'principal', label: 'Principal' },
                          { value: 'subsidiary', label: 'Subsidiary' },
                          { value: 'compulsory', label: 'Compulsory (e.g. GP)' },
                        ]}
                      />
                    </div>
                    {members.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setMembers((rows) => rows.filter((_, idx) => idx !== i))}
                        className="h-11 sm:h-9 px-2 text-text-faint hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" inline onClick={() => setMembers((rows) => [...rows, { subjectId: '', role: 'principal' }])}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                  Add subject
                </Button>
              </div>
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
