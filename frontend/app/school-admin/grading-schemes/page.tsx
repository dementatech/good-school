'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { GradingSchemeFormModal } from '@/components/admin/grading/GradingSchemeFormModal';
import {
  APPLIES_TO_LABEL,
  fetchList,
  REGIME_LABEL,
  submitJson,
  type GradingAppliesTo,
  type GradingScheme,
} from '@/components/admin/grading/types';

export default function SchoolAdminGradingSchemesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [curriculumId, setCurriculumId] = useState('');
  const [schemes, setSchemes] = useState<GradingScheme[]>([]);
  const [modal, setModal] = useState<{ appliesTo: GradingAppliesTo; initial?: GradingScheme } | null>(null);

  const load = useCallback(async (curId: string) => {
    if (!curId) return;
    setSchemes(await fetchList<GradingScheme>(`/api/v1/academic/grading-schemes?curriculumId=${curId}`));
  }, []);

  useEffect(() => {
    void (async () => {
      const schoolCurricula = await fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula');
      const curId = schoolCurricula[0]?.curriculumId ?? '';
      setCurriculumId(curId);
      await load(curId);
      setLoading(false);
    })();
  }, [load]);

  async function del(scheme: GradingScheme) {
    if (!confirm(`Delete "${scheme.name}"?`)) return;
    const res = await submitJson(`/api/v1/academic/grading-schemes/${scheme.id}`, 'DELETE');
    if (res.ok) {
      toast.success('Grading scheme deleted.');
      await load(curriculumId);
    } else {
      toast.error(res.error!);
    }
  }

  const columns: DataTableColumn<GradingScheme>[] = [
    { key: 'name', header: 'Name', value: (s) => s.name, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'regime', header: 'Regime', value: (s) => REGIME_LABEL[s.regime] ?? s.regime },
    { key: 'bands', header: 'Bands', value: (s) => s.bands.length, align: 'right' },
    {
      key: 'isActive',
      header: 'Status',
      value: (s) => (s.isActive ? 'Active' : 'Inactive'),
      render: (s) => <Badge variant={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  const rowActions = (appliesTo: GradingAppliesTo) => (s: GradingScheme): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setModal({ appliesTo, initial: s }) },
    { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onClick: () => void del(s) },
  ];

  const addBtn = (appliesTo: GradingAppliesTo) => (
    <Button onClick={() => setModal({ appliesTo })} disabled={!curriculumId}>
      <Plus className="w-4 h-4 mr-1.5" aria-hidden />
      Add scheme
    </Button>
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  const byPhase = (phase: GradingAppliesTo) => schemes.filter((s) => s.appliesTo === phase);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Grading Schemes</h1>
        <p className="text-sm text-text-muted">
          How raw scores turn into grades — bands are yours to edit, seeded with UNEB&apos;s current
          O-Level scale as a starting point. Each phase has one active scheme at a time.
        </p>
      </div>

      {(Object.keys(APPLIES_TO_LABEL) as GradingAppliesTo[]).map((phase) => (
        <div key={phase} className="space-y-2">
          <h2 className="text-sm font-bold text-primary-900">{APPLIES_TO_LABEL[phase]} schemes</h2>
          <DataTable
            rows={byPhase(phase)}
            columns={columns}
            rowActions={rowActions(phase)}
            rowKey={(s) => s.id}
            initialSort={{ key: 'name', direction: 'asc' }}
            emptyMessage={`No ${APPLIES_TO_LABEL[phase]} grading schemes yet.`}
            exportFileName={`${phase.toLowerCase()}-grading-schemes`}
            actions={addBtn(phase)}
          />
        </div>
      ))}

      {modal && (
        <GradingSchemeFormModal
          open
          onClose={() => setModal(null)}
          onSaved={() => load(curriculumId)}
          curriculumId={curriculumId}
          appliesTo={modal.appliesTo}
          initial={modal.initial}
        />
      )}
    </div>
  );
}
