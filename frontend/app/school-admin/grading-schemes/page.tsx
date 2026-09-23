'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { MoreVertical, Pencil, Settings2 } from 'lucide-react';
import { ChangeGradeSystemModal } from '@/components/admin/grading/ChangeGradeSystemModal';
import { EditGradingRangesModal } from '@/components/admin/grading/EditGradingRangesModal';
import {
  fetchList,
  REGIME_LABEL,
  type GradeRoleScope,
  type GradingAppliesTo,
  type SchoolGradingSchemeSelection,
} from '@/components/admin/grading/types';
import {
  SECTION_LABEL,
  invalidateSchoolLevels,
  subjectPhasesOf,
  useSchoolLevels,
  useSchoolSections,
} from '@/lib/levels';
import { submitJson } from '@/lib/api/envelope';

// One card per phase/track a school can independently pick a grade system
// for. A-Level splits into Principal and Subsidiary because the two are
// graded on genuinely different scales (A-E worth points vs. a 2-band
// Fail/Pass) — see grading-schemes.repository.ts.
const CARDS: { appliesTo: GradingAppliesTo; roleScope: GradeRoleScope; title: string }[] = [
  { appliesTo: 'KINDERGARTEN', roleScope: 'any', title: 'Nursery' },
  { appliesTo: 'PRIMARY', roleScope: 'any', title: 'Primary (PLE)' },
  { appliesTo: 'O_LEVEL', roleScope: 'any', title: 'O-Level' },
  { appliesTo: 'A_LEVEL', roleScope: 'principal', title: 'A-Level — Principal subjects' },
  { appliesTo: 'A_LEVEL', roleScope: 'subsidiary', title: 'A-Level — Subsidiary subjects' },
];

export default function SchoolAdminGradingSchemesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [curriculumId, setCurriculumId] = useState('');
  const [selections, setSelections] = useState<SchoolGradingSchemeSelection[]>([]);
  const [changeModal, setChangeModal] = useState<(typeof CARDS)[number] | null>(null);
  const [editModal, setEditModal] = useState<(typeof CARDS)[number] | null>(null);
  const levels = useSchoolLevels();
  // Kindergarten has no grading — only the levels with subjects get a card.
  const cards = CARDS.filter((c) => subjectPhasesOf(levels).includes(c.appliesTo));
  const { active: activeSection } = useSchoolSections();

  // Whether report cards print positions — the school's choice per section.
  async function setShowPositions(showPositions: boolean) {
    const res = await submitJson('/api/v1/academic/section-settings', 'PUT', { section: activeSection, showPositions });
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    invalidateSchoolLevels();
    window.location.reload();
  }

  const load = useCallback(async () => {
    setSelections(await fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error));
  }, []);

  useEffect(() => {
    void (async () => {
      const schoolCurricula = await fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula', toast.error);
      setCurriculumId(schoolCurricula[0]?.curriculumId ?? '');
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  const selectionFor = (appliesTo: GradingAppliesTo, roleScope: GradeRoleScope) =>
    selections.find((s) => s.appliesTo === appliesTo && s.roleScope === roleScope) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900 mb-1">Grading Schemes</h1>
        {levels && (
          // Built from the levels this school runs — nothing about any other.
          <p className="text-sm text-text-muted">
            How raw scores turn into grades{levels.offersPrimary ? ' (and, for Primary, PLE aggregates)' : ''}.
            Pick a published scheme, then adjust its ranges and comments to your liking.
            {levels.offersALevel &&
              ' A-Level Subsidiary grading is fixed (a uniform UACE rule) and can only be switched between published options.'}
            {levels.offersKindergarten &&
              levels.nurseryAssessment === 'both' &&
              ' Nursery report cards also carry the progress ratings.'}
          </p>
        )}
      </div>

      {activeSection && (
        <label className="flex items-center gap-2 text-sm text-[#12333F]">
          <input
            type="checkbox"
            checked={levels?.showPositions[activeSection] ?? activeSection !== 'KINDERGARTEN'}
            onChange={(e) => void setShowPositions(e.target.checked)}
            className="rounded border-[#E5E5E5]"
          />
          Show each pupil&apos;s position (class ranking) on {SECTION_LABEL[activeSection]} report cards
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const sel = selectionFor(card.appliesTo, card.roleScope);
          const menuItems: DropdownMenuItem[] = [
            {
              label: 'Change Grade System',
              icon: Settings2,
              onClick: () => setChangeModal(card),
              disabled: !curriculumId,
            },
          ];
          if (card.roleScope !== 'subsidiary') {
            menuItems.push({
              label: 'Edit my ranges',
              icon: Pencil,
              onClick: () => setEditModal(card),
              disabled: !sel,
            });
          }
          return (
            <Card key={`${card.appliesTo}-${card.roleScope}`} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-primary-900">{card.title}</h2>
                  {sel ? (
                    <p className="text-xs text-text-muted mt-0.5">
                      {REGIME_LABEL[sel.scheme.regime] ?? sel.scheme.regime}
                    </p>
                  ) : (
                    <p className="text-xs text-text-faint mt-0.5">No scheme selected yet.</p>
                  )}
                </div>
                <div className="shrink-0">
                  <DropdownMenu items={menuItems} label={`${card.title} actions`} icon={MoreVertical} />
                </div>
              </div>

              {sel && (
                <div>
                  <p className="font-medium text-primary-900 flex items-center gap-1.5">
                    {sel.scheme.name}
                    {sel.scheme.schoolId && <Badge variant="accent">Customized</Badge>}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[...sel.scheme.bands]
                      .sort((a, b) => b.minPct - a.minPct)
                      .map((b) => (
                        <Badge key={b.id} variant="muted">
                          {b.label}
                          {b.points !== null ? ` · ${b.points}pt` : ''}
                        </Badge>
                      ))}
                    {sel.scheme.bands.length === 0 && <span className="text-xs text-text-faint">No bands yet</span>}
                  </div>
                  {sel.scheme.divisions && sel.scheme.aggregateSubjectCount && (
                    <div className="mt-3 text-xs text-text-muted">
                      <p className="mb-1">
                        Aggregate of the best {sel.scheme.aggregateSubjectCount} examinable subjects (lower is
                        better):
                      </p>
                      <ul className="space-y-0.5">
                        {sel.scheme.divisions.map((d) => (
                          <li key={d.label} className="flex justify-between gap-2">
                            <span>{d.label}</span>
                            <span className="tabular-nums">
                              {d.minAggregate}–{d.maxAggregate}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {changeModal && (
        <ChangeGradeSystemModal
          open
          onClose={() => setChangeModal(null)}
          onSaved={load}
          curriculumId={curriculumId}
          appliesTo={changeModal.appliesTo}
          roleScope={changeModal.roleScope}
          currentSchemeId={selectionFor(changeModal.appliesTo, changeModal.roleScope)?.scheme.id ?? null}
          cardTitle={changeModal.title}
        />
      )}

      {editModal && (
        <EditGradingRangesModal
          open
          onClose={() => setEditModal(null)}
          onSaved={load}
          appliesTo={editModal.appliesTo}
          roleScope={editModal.roleScope}
          currentBands={selectionFor(editModal.appliesTo, editModal.roleScope)?.scheme.bands ?? []}
          cardTitle={editModal.title}
        />
      )}
    </div>
  );
}
