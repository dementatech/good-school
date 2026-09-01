'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { CurriculumFormModal } from '@/components/admin/curriculum/CurriculumFormModal';
import { StageFormModal } from '@/components/admin/curriculum/StageFormModal';
import { SubjectFormModal } from '@/components/admin/curriculum/SubjectFormModal';
import { CombinationFormModal } from '@/components/admin/curriculum/CombinationFormModal';
import {
  submitJson,
  type Combination,
  type Curriculum,
  type Phase,
  type Stage,
  type Subject,
} from '@/components/admin/curriculum/types';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function CurriculumPage() {
  const toast = useToast();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [curriculumId, setCurriculumId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [loading, setLoading] = useState(true);

  // modal targets — `null` closed, `{}` = add, an object = edit
  const [curriculumModal, setCurriculumModal] = useState<{ initial?: Curriculum } | null>(null);
  const [stageModal, setStageModal] = useState<{ initial?: Stage } | null>(null);
  const [subjectModal, setSubjectModal] = useState<{ phase: Phase; initial?: Subject } | null>(null);
  const [combinationModal, setCombinationModal] = useState<{ initial?: Combination } | null>(null);

  const loadCurricula = useCallback(async () => {
    const res = await fetch('/api/v1/academic/curricula').then((r) => r.json());
    if (res.success) setCurricula(res.data);
    return res.success ? (res.data as Curriculum[]) : [];
  }, []);

  const reloadForCurriculum = useCallback(async (cid: string) => {
    if (!cid) return;
    const [st, su, co] = await Promise.all([
      fetch(`/api/v1/academic/stages?curriculumId=${cid}`).then((r) => r.json()),
      fetch(`/api/v1/academic/subjects?curriculumId=${cid}`).then((r) => r.json()),
      fetch(`/api/v1/academic/combinations?curriculumId=${cid}`).then((r) => r.json()),
    ]);
    if (st.success) setStages(st.data);
    if (su.success) setSubjects(su.data);
    if (co.success) setCombinations(co.data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const list = await loadCurricula();
        if (!controller.signal.aborted && list.length) {
          setCurriculumId(list[0].id);
          await reloadForCurriculum(list[0].id);
        }
      } catch {
        toast.error('Network error loading curriculum data.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [loadCurricula, reloadForCurriculum, toast]);

  const reloadAll = useCallback(async () => {
    await loadCurricula();
    await reloadForCurriculum(curriculumId);
  }, [loadCurricula, reloadForCurriculum, curriculumId]);

  async function switchCurriculum(cid: string) {
    setCurriculumId(cid);
    await reloadForCurriculum(cid);
  }

  async function del(url: string, confirmText: string, label: string) {
    if (!confirm(confirmText)) return;
    const res = await submitJson(url, 'DELETE');
    if (res.ok) {
      toast.success(`${label} deleted.`);
      await reloadAll();
    } else {
      toast.error(res.error!);
    }
  }

  const stageName = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.code])),
    [stages],
  );
  const subjectName = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s.name])),
    [subjects],
  );

  const oLevelStages = stages.filter((s) => s.phase === 'O_LEVEL');
  const aLevelStages = stages.filter((s) => s.phase === 'A_LEVEL');
  const oLevelSubjects = subjects.filter((s) => s.phase === 'O_LEVEL');
  const aLevelSubjects = subjects.filter((s) => s.phase === 'A_LEVEL');
  const comboSubjects = aLevelSubjects.filter((s) => s.stageIds.length > 0);

  // ── column defs ──────────────────────────────────────────────────────────
  const curriculumCols: DataTableColumn<Curriculum>[] = [
    { key: 'code', header: 'Code', value: (c) => c.code, render: (c) => <span className="font-medium">{c.code}</span> },
    { key: 'name', header: 'Name', value: (c) => c.name },
    { key: 'awardingBody', header: 'Awarding body', value: (c) => c.awardingBody ?? '', hideOnMobile: true },
    {
      key: 'isActive',
      header: 'Status',
      value: (c) => (c.isActive ? 'Active' : 'Inactive'),
      render: (c) => <Badge variant={c.isActive ? 'success' : 'muted'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];
  const curriculumActions = (c: Curriculum): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setCurriculumModal({ initial: c }) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void del(`/api/v1/academic/curricula/${c.id}`, `Delete curriculum ${c.code}?`, c.code),
    },
  ];

  const stageCols: DataTableColumn<Stage>[] = [
    { key: 'sequenceNumber', header: '#', value: (s) => s.sequenceNumber, align: 'right' },
    { key: 'code', header: 'Code', value: (s) => s.code, render: (s) => <span className="font-medium">{s.code}</span> },
    { key: 'name', header: 'Name', value: (s) => s.name },
    {
      key: 'phase',
      header: 'Phase',
      value: (s) => s.phase ?? '',
      render: (s) => (s.phase ? <Badge variant={s.phase === 'A_LEVEL' ? 'accent' : 'muted'}>{s.phase}</Badge> : '—'),
    },
    { key: 'ageEquivalentYears', header: 'Typical age', value: (s) => s.ageEquivalentYears ?? '', align: 'right', hideOnMobile: true },
  ];
  const stageActions = (s: Stage): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setStageModal({ initial: s }) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void del(`/api/v1/academic/stages/${s.id}`, `Delete stage ${s.code}?`, s.code),
    },
  ];

  const subjectCols: DataTableColumn<Subject>[] = [
    { key: 'name', header: 'Subject', value: (s) => s.name, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'code', header: 'Code', value: (s) => s.code, render: (s) => <Badge variant="muted">{s.code}</Badge> },
    { key: 'category', header: 'Category', value: (s) => s.category, hideOnMobile: true },
    {
      key: 'stages',
      header: 'Offered at',
      value: (s) => s.stageIds.map((id) => stageName[id] ?? '').join(' '),
      render: (s) =>
        s.stageIds.length
          ? s.stageIds.map((id) => stageName[id]).filter(Boolean).sort().join(', ')
          : <span className="text-text-faint">—</span>,
    },
    {
      key: 'isExaminable',
      header: 'Exam',
      value: (s) => (s.isExaminable ? 'Yes' : 'No'),
      hideOnMobile: true,
      render: (s) => (s.isExaminable ? 'Yes' : <span className="text-text-faint">No</span>),
    },
    {
      key: 'isActive',
      header: 'Status',
      value: (s) => (s.isActive ? 'Active' : 'Inactive'),
      render: (s) => <Badge variant={s.isActive ? 'success' : 'muted'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];
  const subjectActions = (phase: Phase) => (s: Subject): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setSubjectModal({ phase, initial: s }) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void del(`/api/v1/academic/subjects/${s.id}`, `Delete ${s.name}?`, s.name),
    },
  ];

  const combinationCols: DataTableColumn<Combination>[] = [
    { key: 'code', header: 'Code', value: (c) => c.code, render: (c) => <span className="font-medium">{c.code}</span> },
    { key: 'name', header: 'Name', value: (c) => c.name },
    {
      key: 'subjects',
      header: 'Subjects',
      value: (c) => c.subjects.map((m) => subjectName[m.subjectId] ?? '').join(' '),
      render: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.subjects.map((m) => (
            <span key={m.subjectId} className="inline-flex items-center gap-1 rounded bg-[#FAFAFA] px-1.5 py-0.5 text-xs">
              {subjectName[m.subjectId] ?? '(deleted)'}
              <span className="text-text-faint">·{m.role[0]}</span>
            </span>
          ))}
        </span>
      ),
    },
  ];
  const combinationActions = (c: Combination): DropdownMenuItem[] => [
    { label: 'Edit', icon: Pencil, onClick: () => setCombinationModal({ initial: c }) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      separatorBefore: true,
      onClick: () => void del(`/api/v1/academic/combinations/${c.id}`, `Delete combination ${c.code}?`, c.code),
    },
  ];

  const addBtn = (label: string, onClick: () => void, disabled = false) => (
    <Button onClick={onClick} disabled={disabled}>
      <Plus className="w-4 h-4 mr-1.5" aria-hidden />
      {label}
    </Button>
  );

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Curriculum &amp; Subjects</h1>
        <p className="text-sm text-text-muted">
          Reference data shared by every school — the class ladder, the O-Level and A-Level subject
          catalogs, and the A-Level subject combinations.
        </p>
      </div>

      <Section title="Curricula" description="The exam systems the platform supports.">
        <DataTable
          rows={curricula}
          columns={curriculumCols}
          rowActions={curriculumActions}
          rowKey={(c) => c.id}
          initialSort={{ key: 'code', direction: 'asc' }}
          emptyMessage="No curricula yet."
          exportFileName="curricula"
          actions={addBtn('Add curriculum', () => setCurriculumModal({}))}
        />
      </Section>

      {curricula.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-text-muted tracking-wide">Editing curriculum</label>
          <select
            value={curriculumId}
            onChange={(e) => void switchCurriculum(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm"
          >
            {curricula.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Section title="Class ladder" description="Senior 1–6, split into O-Level and A-Level phases.">
        <DataTable
          rows={stages}
          columns={stageCols}
          rowActions={stageActions}
          rowKey={(s) => s.id}
          initialSort={{ key: 'sequenceNumber', direction: 'asc' }}
          emptyMessage="No stages for this curriculum."
          exportFileName="stages"
          actions={addBtn('Add stage', () => setStageModal({}), !curriculumId)}
        />
      </Section>

      <Section
        title="O-Level subjects"
        description="The NLSC catalog — a learner sits 8–10 of these across Senior 1–4."
      >
        <DataTable
          rows={oLevelSubjects}
          columns={subjectCols}
          rowActions={subjectActions('O_LEVEL')}
          rowKey={(s) => s.id}
          initialSort={{ key: 'name', direction: 'asc' }}
          emptyMessage="No O-Level subjects yet."
          exportFileName="o-level-subjects"
          actions={addBtn('Add O-Level subject', () => setSubjectModal({ phase: 'O_LEVEL' }), !curriculumId)}
        />
      </Section>

      <Section
        title="A-Level subjects"
        description="Principal / subsidiary subjects — what A-Level combinations are built from."
      >
        <DataTable
          rows={aLevelSubjects}
          columns={subjectCols}
          rowActions={subjectActions('A_LEVEL')}
          rowKey={(s) => s.id}
          initialSort={{ key: 'name', direction: 'asc' }}
          emptyMessage="No A-Level subjects yet."
          exportFileName="a-level-subjects"
          actions={addBtn('Add A-Level subject', () => setSubjectModal({ phase: 'A_LEVEL' }), !curriculumId)}
        />
      </Section>

      <Section
        title="A-Level combinations"
        description="Built from A-Level subjects that already exist. Principal subjects drive UACE points."
      >
        {aLevelStages.length === 0 ? (
          <p className="text-sm text-text-muted">
            This curriculum has no A-Level stages, so it has no subject combinations.
          </p>
        ) : comboSubjects.length === 0 ? (
          <p className="text-sm text-text-muted">
            Add A-Level subjects and mark them as offered at Senior 5 / Senior 6 before building a
            combination.
          </p>
        ) : (
          <DataTable
            rows={combinations}
            columns={combinationCols}
            rowActions={combinationActions}
            rowKey={(c) => c.id}
            initialSort={{ key: 'code', direction: 'asc' }}
            emptyMessage="No combinations yet."
            exportFileName="combinations"
            actions={addBtn('Add combination', () => setCombinationModal({}))}
          />
        )}
      </Section>

      {/* ── modals ─────────────────────────────────────────────── */}
      {curriculumModal && (
        <CurriculumFormModal
          open
          onClose={() => setCurriculumModal(null)}
          onSaved={reloadAll}
          initial={curriculumModal.initial}
        />
      )}
      {stageModal && (
        <StageFormModal
          open
          onClose={() => setStageModal(null)}
          onSaved={reloadAll}
          curriculumId={curriculumId}
          initial={stageModal.initial}
        />
      )}
      {subjectModal && (
        <SubjectFormModal
          open
          onClose={() => setSubjectModal(null)}
          onSaved={reloadAll}
          curriculumId={curriculumId}
          phase={subjectModal.phase}
          stages={subjectModal.phase === 'O_LEVEL' ? oLevelStages : aLevelStages}
          initial={subjectModal.initial}
        />
      )}
      {combinationModal && (
        <CombinationFormModal
          open
          onClose={() => setCombinationModal(null)}
          onSaved={reloadAll}
          curriculumId={curriculumId}
          subjects={comboSubjects}
          initial={combinationModal.initial}
        />
      )}
    </div>
  );
}
