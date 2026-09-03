'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { fetchList, submitJson } from '@/lib/api/envelope';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { SchoolCombinationFormModal } from '@/components/admin/subjects/SchoolCombinationFormModal';
import {
  CATEGORY_LABEL,
  type AcademicYear,
  type CatalogSubject,
  type SchoolCombination,
  type SubjectOffering,
} from '@/components/admin/subjects/types';

// A school's O-Level offering, one row per catalog subject (super_admin's
// "constants") whether or not the school has toggled it on yet — a subject
// with no `subject_offering` row is simply "not offered, not compulsory".
interface OfferingRow {
  subjectId: string;
  code: string;
  name: string;
  category: string;
  isOffered: boolean;
  isCompulsory: boolean;
}

export default function SchoolAdminSubjectsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [catalogSubjects, setCatalogSubjects] = useState<CatalogSubject[]>([]);
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);
  const [combinations, setCombinations] = useState<SchoolCombination[]>([]);
  const [comboModal, setComboModal] = useState<{ combination?: SchoolCombination } | null>(null);

  const currentYear = years.find((y) => y.isCurrent) ?? years[0];
  const effectiveYearId = yearId || currentYear?.id || '';

  useEffect(() => {
    void (async () => {
      const [yearsRes, schoolCurricula] = await Promise.all([
        fetchList<AcademicYear>('/api/v1/academic/years'),
        fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula'),
      ]);
      setYears(yearsRes);
      const curId = schoolCurricula[0]?.curriculumId ?? '';
      setCurriculumId(curId);
      if (curId) {
        setCatalogSubjects(await fetchList<CatalogSubject>(`/api/v1/academic/subjects?curriculumId=${curId}`));
      }
      setLoading(false);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!effectiveYearId) return;
    const [offeringsRes, combosRes] = await Promise.all([
      fetchList<SubjectOffering>(`/api/v1/academic/subject-offerings?academicYearId=${effectiveYearId}`),
      fetchList<SchoolCombination>(`/api/v1/academic/school-combinations?academicYearId=${effectiveYearId}`),
    ]);
    setOfferings(offeringsRes);
    setCombinations(combosRes);
  }, [effectiveYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function setOffering(subjectId: string, isOffered: boolean, isCompulsory: boolean) {
    const res = await submitJson(`/api/v1/academic/subject-offerings?academicYearId=${effectiveYearId}`, 'POST', {
      subjectId,
      isOffered,
      isCompulsory,
    });
    if (res.ok) await load();
    else toast.error(res.error!);
  }

  async function removeCombination(combo: SchoolCombination) {
    if (!confirm(`Remove ${combo.code} from your school's offering?`)) return;
    const res = await submitJson(`/api/v1/academic/school-combinations/${combo.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Combination removed.');
      await load();
    } else {
      toast.error(res.error!);
    }
  }

  const offeringByCode = new Map(offerings.map((o) => [o.subjectId, o]));

  function subjectRows(phase: 'O_LEVEL' | 'A_LEVEL'): OfferingRow[] {
    return catalogSubjects
      .filter((s) => s.phase === phase && s.isActive)
      .map((s) => {
        const o = offeringByCode.get(s.id);
        return {
          subjectId: s.id,
          code: s.code,
          name: s.name,
          category: s.category,
          isOffered: o?.isOffered ?? false,
          isCompulsory: o?.isCompulsory ?? false,
        };
      });
  }

  const subjectColumns: DataTableColumn<OfferingRow>[] = [
    {
      key: 'name',
      header: 'Subject',
      value: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-medium">{r.name}</span>
          <Badge variant="muted">{r.code}</Badge>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      value: (r) => r.category,
      render: (r) => CATEGORY_LABEL[r.category] ?? r.category,
    },
    {
      key: 'isOffered',
      header: 'Offered here',
      value: (r) => (r.isOffered ? 1 : 0),
      align: 'right',
      render: (r) => (
        <input
          type="checkbox"
          checked={r.isOffered}
          onChange={(e) => void setOffering(r.subjectId, e.target.checked, e.target.checked ? r.isCompulsory : false)}
          className="rounded border-[#E5E5E5]"
        />
      ),
    },
    {
      key: 'isCompulsory',
      header: 'Compulsory',
      value: (r) => (r.isCompulsory ? 1 : 0),
      align: 'right',
      render: (r) => (
        <input
          type="checkbox"
          checked={r.isCompulsory}
          disabled={!r.isOffered}
          onChange={(e) => void setOffering(r.subjectId, true, e.target.checked)}
          className="rounded border-[#E5E5E5] disabled:opacity-40"
        />
      ),
    },
  ];

  const combinationColumns: DataTableColumn<SchoolCombination>[] = [
    {
      key: 'name',
      header: 'Combination',
      value: (c) => c.name,
      render: (c) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default">{c.code}</Badge>
          <span className="font-medium">{c.name}</span>
          {c.catalogCombinationId && <span className="text-xs text-text-faint">from catalog</span>}
        </span>
      ),
    },
    {
      key: 'subjects',
      header: 'Subjects',
      value: (c) => c.subjects.map((s) => s.subjectCode).join(', '),
      render: (c) => (
        <span className="text-xs text-text-muted">
          {c.subjects.map((s) => `${s.subjectCode}${s.role === 'principal' ? '' : ` (${s.role})`}`).join(', ')}
        </span>
      ),
    },
    {
      key: 'isOffered',
      header: 'Status',
      value: (c) => (c.isOffered ? 'Offered' : 'Not offered'),
      render: (c) => <Badge variant={c.isOffered ? 'success' : 'muted'}>{c.isOffered ? 'Offered' : 'Not offered'}</Badge>,
    },
  ];

  const combinationActions = (c: SchoolCombination): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setComboModal({ combination: c }) },
    { label: 'Remove', icon: Trash2, danger: true, separatorBefore: true, onClick: () => void removeCombination(c) },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1">Subjects & Combinations</h1>
          <p className="text-sm text-text-muted">
            Pick which subjects and A-Level combinations your school runs — the catalog itself is
            set platform-wide.
          </p>
        </div>
        {years.length > 1 && (
          <div className="w-48">
            <Select
              label="Academic year"
              value={effectiveYearId}
              onChange={(e) => setYearId(e.target.value)}
              options={years.map((y) => ({ value: y.id, label: y.yearName }))}
            />
          </div>
        )}
      </div>

      {!effectiveYearId ? (
        <p className="text-sm text-text-muted">Set up an academic year first.</p>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-primary-900">O-Level subjects</h2>
            <DataTable
              rows={subjectRows('O_LEVEL')}
              columns={subjectColumns}
              rowKey={(r) => r.subjectId}
              initialSort={{ key: 'name', direction: 'asc' }}
              searchPlaceholder="Search subjects…"
              emptyMessage="No O-Level subjects in the catalog yet — a super-admin sets those up."
              exportFileName="o-level-subjects"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-primary-900">A-Level subjects</h2>
            <DataTable
              rows={subjectRows('A_LEVEL')}
              columns={subjectColumns}
              rowKey={(r) => r.subjectId}
              initialSort={{ key: 'name', direction: 'asc' }}
              searchPlaceholder="Search subjects…"
              emptyMessage="No A-Level subjects in the catalog yet — a super-admin sets those up."
              exportFileName="a-level-subjects"
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-bold text-primary-900">A-Level combinations</h2>
            <DataTable
              rows={combinations}
              columns={combinationColumns}
              rowActions={combinationActions}
              rowKey={(c) => c.id}
              initialSort={{ key: 'name', direction: 'asc' }}
              searchPlaceholder="Search combinations…"
              emptyMessage="No combinations yet — add one from the national catalog, or define a custom one."
              exportFileName="combinations"
              actions={
                <Button onClick={() => setComboModal({})}>
                  <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                  Add combination
                </Button>
              }
            />
          </div>
        </>
      )}

      {comboModal && effectiveYearId && (
        <SchoolCombinationFormModal
          open
          onClose={() => setComboModal(null)}
          onSaved={load}
          academicYearId={effectiveYearId}
          curriculumId={curriculumId}
          combination={comboModal.combination}
        />
      )}
    </div>
  );
}
