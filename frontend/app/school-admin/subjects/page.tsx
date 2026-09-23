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
import { SubjectTeacherAssignmentModal } from '@/components/admin/subjects/SubjectTeacherAssignmentModal';
import { SubjectFormModal } from '@/components/admin/curriculum/SubjectFormModal';
import { AlertTriangle, UserCog } from 'lucide-react';
import type { AllocationGap } from '@/components/admin/staff/types';
import type { Phase, Stage } from '@/components/admin/curriculum/types';
import {
  A_LEVEL_CATEGORIES,
  O_LEVEL_CATEGORIES,
  PHASE_LABEL,
  PRIMARY_CATEGORIES,
} from '@/components/admin/curriculum/types';
import { SUBJECT_PHASES, offersLevel, subjectPhasesOf, useSchoolLevels } from '@/lib/levels';
import { NurseryAssessmentCard } from '@/components/admin/subjects/NurseryAssessmentCard';
import { SchoolSubjectModal } from '@/components/admin/subjects/SchoolSubjectModal';
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  type AcademicYear,
  type CatalogSubject,
  type SchoolCombination,
  type SubjectOffering,
} from '@/components/admin/subjects/types';

// A school can never propose 'core' (Primary/O-Level) — that's platform-only. There's
// no A-Level equivalent to exclude: General Paper is protected by the
// `isGeneralPaper` flag (never settable through this form), not by category —
// a school can freely propose a Science, Art, or ordinary Subsidiary subject.
// See backend routes.ts POST /subjects.
const PROPOSABLE_CATEGORIES: Record<Phase, typeof O_LEVEL_CATEGORIES> = {
  KINDERGARTEN: [],
  PRIMARY: PRIMARY_CATEGORIES.filter((c) => c !== 'core'),
  O_LEVEL: O_LEVEL_CATEGORIES.filter((c) => c !== 'core'),
  A_LEVEL: A_LEVEL_CATEGORIES,
};

// A school's offering for one level, one row per catalog subject (super_admin's
// "constants") whether or not the school has toggled it on yet — a subject
// with no `subject_offering` row is simply "not offered, not compulsory".
interface OfferingRow {
  subjectId: string;
  code: string;
  name: string;
  category: string;
  phase: Phase;
  isOffered: boolean;
  isCompulsory: boolean;
  /** Marked out of (100, 50, ...) — per school, per year. */
  maxMark: number;
  /** The school's own subject: it can rename or delete it. */
  schoolOwned: boolean;
  shortName: string;
}

export default function SchoolAdminSubjectsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [catalogSubjects, setCatalogSubjects] = useState<CatalogSubject[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [offerings, setOfferings] = useState<SubjectOffering[]>([]);
  const [combinations, setCombinations] = useState<SchoolCombination[]>([]);
  const [comboModal, setComboModal] = useState<{ combination?: SchoolCombination } | null>(null);
  const [gaps, setGaps] = useState<AllocationGap[]>([]);
  const [teacherModal, setTeacherModal] = useState<{
    subjectId: string;
    subjectName: string;
    subjectPhase: Phase;
  } | null>(null);
  const [proposeModal, setProposeModal] = useState<{ phase: Phase } | null>(null);
  const [schoolSubjectModal, setSchoolSubjectModal] = useState<{
    phase: Phase;
    subject?: { id: string; name: string; shortName: string };
  } | null>(null);
  const levels = useSchoolLevels();
  // Only this school's own levels that have subjects — nothing until known.
  // Every level this school runs — Nursery included whatever its assessment
  // style: its subjects are used on the timetable and in lesson plans too, and
  // are only marked when the school switches Nursery to marks.
  const phasesShown = SUBJECT_PHASES.filter((p) => levels && offersLevel(levels, p));
  const nurseryMarks = subjectPhasesOf(levels).includes('KINDERGARTEN');
  const showsALevel = phasesShown.includes('A_LEVEL');

  const currentYear = years.find((y) => y.isCurrent) ?? years[0];
  const effectiveYearId = yearId || currentYear?.id || '';

  const loadSubjects = useCallback(async (curId: string) => {
    if (!curId) return;
    const [subjectsRes, stagesRes] = await Promise.all([
      fetchList<CatalogSubject>(`/api/v1/academic/subjects?curriculumId=${curId}`, toast.error),
      fetchList<Stage>(`/api/v1/academic/stages?curriculumId=${curId}`, toast.error),
    ]);
    setCatalogSubjects(subjectsRes);
    setStages(stagesRes);
  }, []);

  useEffect(() => {
    void (async () => {
      const [yearsRes, schoolCurricula] = await Promise.all([
        fetchList<AcademicYear>('/api/v1/academic/years', toast.error),
        fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula', toast.error),
      ]);
      setYears(yearsRes);
      const curId = schoolCurricula[0]?.curriculumId ?? '';
      setCurriculumId(curId);
      await loadSubjects(curId);
      setLoading(false);
    })();
  }, [loadSubjects]);

  const load = useCallback(async () => {
    if (!effectiveYearId) return;
    const [offeringsRes, combosRes, gapsRes] = await Promise.all([
      fetchList<SubjectOffering>(`/api/v1/academic/subject-offerings?academicYearId=${effectiveYearId}`, toast.error),
      fetchList<SchoolCombination>(`/api/v1/academic/school-combinations?academicYearId=${effectiveYearId}`, toast.error),
      fetchList<AllocationGap>(`/api/v1/subject-teacher-assignments/gaps?academicYearId=${effectiveYearId}`, toast.error),
    ]);
    setOfferings(offeringsRes);
    setCombinations(combosRes);
    setGaps(gapsRes);
  }, [effectiveYearId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!controller.signal.aborted) await load();
    })();
    return () => controller.abort();
  }, [load]);

  async function setOffering(subjectId: string, isOffered: boolean, isCompulsory: boolean, maxMark?: number) {
    const res = await submitJson(`/api/v1/academic/subject-offerings?academicYearId=${effectiveYearId}`, 'POST', {
      subjectId,
      isOffered,
      isCompulsory,
      ...(maxMark !== undefined ? { maxMark } : {}),
    });
    if (res.ok) await load();
    else toast.error(res.error!);
  }

  async function deleteSchoolSubject(r: OfferingRow) {
    if (!confirm(`Delete ${r.name}? This can't be undone.`)) return;
    const res = await submitJson(`/api/v1/academic/school-subjects/${r.subjectId}`, 'DELETE');
    if (res.ok) {
      toast.success(`${r.name} deleted.`);
      await Promise.all([loadSubjects(curriculumId), load()]);
    } else {
      toast.error(res.error!);
    }
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
  // Only gaps in the section being worked in (the gaps list is school-wide).
  const sectionSubjectIds = new Set(offerings.map((o) => o.subjectId));
  const sectionGaps = gaps.filter((g) => sectionSubjectIds.has(g.subjectId));

  function subjectRows(phase: Phase): OfferingRow[] {
    return catalogSubjects
      .filter((s) => s.phase === phase && s.isActive && s.status === 'approved')
      .map((s) => {
        const o = offeringByCode.get(s.id);
        return {
          subjectId: s.id,
          code: s.code,
          name: s.name,
          category: s.category,
          phase: s.phase,
          isOffered: o?.isOffered ?? false,
          isCompulsory: o?.isCompulsory ?? false,
          maxMark: o?.maxMark ?? 100,
          schoolOwned: !!s.schoolId,
          shortName: s.shortName,
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
          {r.schoolOwned && r.phase !== 'KINDERGARTEN' && <Badge variant="accent">School&apos;s own</Badge>}
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
    {
      // Some schools mark a subject out of 50, others out of 100 — marks are
      // entered as given; grades and averages use the percentage.
      key: 'maxMark',
      header: 'Out of',
      value: (r) => r.maxMark,
      align: 'right',
      render: (r) =>
        r.isOffered ? (
          <input
            key={`${r.subjectId}-${r.maxMark}`}
            type="number"
            min={1}
            max={999}
            defaultValue={r.maxMark}
            aria-label={`${r.name} marked out of`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== r.maxMark && Number.isInteger(v) && v >= 1 && v <= 999) {
                void setOffering(r.subjectId, r.isOffered, r.isCompulsory, v);
              } else {
                e.target.value = String(r.maxMark);
              }
            }}
            className="w-16 border border-border rounded-lg px-2 py-1 text-sm text-right tabular-nums"
          />
        ) : (
          <span className="text-text-faint">—</span>
        ),
    },
    {
      // docs/design/teachers-module.md §4 — allocate right on this screen,
      // not a separate forgettable step.
      key: 'teacher',
      header: 'Teacher',
      value: (r) => (gaps.some((g) => g.subjectId === r.subjectId) ? 0 : 1),
      render: (r) =>
        r.isOffered ? (
          <button
            type="button"
            onClick={() => setTeacherModal({ subjectId: r.subjectId, subjectName: r.name, subjectPhase: r.phase })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline"
          >
            <UserCog className="w-3.5 h-3.5" aria-hidden />
            {gaps.some((g) => g.subjectId === r.subjectId) ? (
              <Badge variant="accent">Unassigned</Badge>
            ) : (
              'Assigned'
            )}
          </button>
        ) : (
          <span className="text-text-faint">—</span>
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
      value: (c) => c.subjects.map((s) => s.subjectShortName).join(', '),
      render: (c) => (
        <span className="text-xs text-text-muted">
          {c.subjects.map((s) => `${s.subjectShortName}${s.role === 'principal' ? '' : ` (${s.role})`}`).join(', ')}
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

  const proposedSubjects = catalogSubjects.filter((s) => s.status !== 'approved');

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
          <h1 className="text-2xl font-bold text-primary-900 mb-1">
            {showsALevel ? 'Subjects & Combinations' : 'Subjects'}
          </h1>
          <p className="text-sm text-text-muted">
            Pick which subjects{showsALevel ? ' and A-Level combinations' : ''} your school runs
            {phasesShown.some((p) => p !== 'KINDERGARTEN') || nurseryMarks ? ' and what each is marked out of' : ''}.
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
          {sectionGaps.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-accent-light bg-accent-lighter p-3 text-sm text-accent-dark">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>{sectionGaps.length}</strong> subject{sectionGaps.length > 1 ? 's' : ''} offered here with nobody
                assigned to teach {sectionGaps.length > 1 ? 'them' : 'it'} yet: {sectionGaps.map((g) => g.subjectName).join(', ')}.
                Click <em>Unassigned</em> in the Teacher column below to fix it.
              </span>
            </div>
          )}

          {levels?.offersKindergarten && (
            <NurseryAssessmentCard
              current={levels.nurseryAssessment}
              showPositions={levels.showPositions.KINDERGARTEN ?? false}
            />
          )}

          {phasesShown.map((phase) => (
            <div key={phase} className="space-y-2">
              <h2 className="text-sm font-bold text-primary-900">{PHASE_LABEL[phase]} subjects</h2>
              {phase === 'KINDERGARTEN' && (
                <p className="text-xs text-text-muted">
                  Your Nursery subjects are your school&apos;s own — add, rename or remove them freely.{' '}
                  {nurseryMarks
                    ? 'Set what each is marked out of.'
                    : 'They appear on the timetable and in lesson plans; they’re only marked if you switch Nursery to marks above.'}
                </p>
              )}
              {phase === 'PRIMARY' && (
                <p className="text-xs text-text-muted">
                  English, Mathematics, Integrated Science and Social Studies are examined at PLE and make up
                  each pupil&apos;s aggregate; the other subjects are taught and reported but not aggregated.
                </p>
              )}
              <DataTable
                rows={subjectRows(phase)}
                columns={
                  phase === 'KINDERGARTEN'
                    ? subjectColumns.filter(
                        (c) =>
                          c.key !== 'category' &&
                          c.key !== 'isCompulsory' &&
                          // "Out of" only matters once Nursery is marked.
                          (nurseryMarks || c.key !== 'maxMark'),
                      )
                    : subjectColumns
                }
                rowKey={(r) => r.subjectId}
                rowActions={(r) =>
                  r.schoolOwned
                    ? [
                        {
                          label: 'Rename',
                          icon: Pencil,
                          onClick: () =>
                            setSchoolSubjectModal({
                              phase,
                              subject: { id: r.subjectId, name: r.name, shortName: r.shortName },
                            }),
                        },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          danger: true,
                          separatorBefore: true,
                          onClick: () => void deleteSchoolSubject(r),
                        },
                      ]
                    : []
                }
                initialSort={{ key: 'name', direction: 'asc' }}
                searchPlaceholder="Search subjects…"
                emptyMessage={
                  phase === 'KINDERGARTEN'
                    ? 'No Nursery subjects yet — add your first one.'
                    : `No ${PHASE_LABEL[phase]} subjects in the catalog yet — a super-admin sets those up.`
                }
                exportFileName={`${phase.toLowerCase().replace('_', '-')}-subjects`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      inline
                      variant={phase === 'KINDERGARTEN' ? 'primary' : 'outline'}
                      onClick={() => setSchoolSubjectModal({ phase })}
                      disabled={!curriculumId || !effectiveYearId}
                    >
                      <Plus className="w-4 h-4 mr-1.5" aria-hidden />
                      {phase === 'KINDERGARTEN' ? 'Add subject' : 'Add school subject'}
                    </Button>
                    {phase !== 'KINDERGARTEN' && (
                      <Button inline variant="outline" onClick={() => setProposeModal({ phase })} disabled={!curriculumId}>
                        Propose an exam subject
                      </Button>
                    )}
                  </div>
                }
              />
            </div>
          ))}

          {levels?.offersKindergarten && levels.nurseryAssessment !== 'marks' && (
            <p className="rounded-xl border border-border bg-bg-card p-3 text-sm text-text-muted">
              The Nursery progress ratings (Emerging / Developing / Proficient) are rated against learning
              areas — manage them under <strong>Kindergarten Progress</strong>.
            </p>
          )}

          {proposedSubjects.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-primary-900">Your proposed subjects</h2>
              <DataTable
                rows={proposedSubjects}
                columns={[
                  {
                    key: 'name',
                    header: 'Subject',
                    value: (s) => s.name,
                    render: (s) => <span className="font-medium">{s.name}</span>,
                  },
                  { key: 'phase', header: 'Phase', value: (s) => s.phase },
                  {
                    key: 'category',
                    header: 'Category',
                    value: (s) => CATEGORY_LABEL[s.category] ?? s.category,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    value: (s) => s.status,
                    render: (s) => (
                      <span className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                        {s.status === 'rejected' && s.rejectionReason && (
                          <span className="text-xs text-text-faint">{s.rejectionReason}</span>
                        )}
                      </span>
                    ),
                  },
                ]}
                rowKey={(s) => s.id}
                initialSort={{ key: 'name', direction: 'asc' }}
                emptyMessage="No proposed subjects."
                exportFileName="proposed-subjects"
              />
            </div>
          )}

          {showsALevel && (
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
          )}
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

      {proposeModal && (
        <SubjectFormModal
          open
          onClose={() => setProposeModal(null)}
          onSaved={() => loadSubjects(curriculumId)}
          curriculumId={curriculumId}
          phase={proposeModal.phase}
          stages={stages.filter((s) => s.phase === proposeModal.phase)}
          categories={PROPOSABLE_CATEGORIES[proposeModal.phase]}
          isProposal
        />
      )}

      {schoolSubjectModal && effectiveYearId && (
        <SchoolSubjectModal
          open
          onClose={() => setSchoolSubjectModal(null)}
          onSaved={() => Promise.all([loadSubjects(curriculumId), load()]).then(() => undefined)}
          phase={schoolSubjectModal.phase}
          academicYearId={effectiveYearId}
          subject={schoolSubjectModal.subject}
        />
      )}

      {teacherModal && effectiveYearId && (
        <SubjectTeacherAssignmentModal
          open
          onClose={() => setTeacherModal(null)}
          onChanged={load}
          academicYearId={effectiveYearId}
          subjectId={teacherModal.subjectId}
          subjectName={teacherModal.subjectName}
          subjectPhase={teacherModal.subjectPhase}
        />
      )}
    </div>
  );
}
