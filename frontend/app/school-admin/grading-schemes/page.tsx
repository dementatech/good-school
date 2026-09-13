'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { Settings2 } from 'lucide-react';
import { ChangeGradeSystemModal } from '@/components/admin/grading/ChangeGradeSystemModal';
import {
  fetchList,
  REGIME_LABEL,
  type GradeRoleScope,
  type GradingAppliesTo,
  type SchoolGradingSchemeSelection,
} from '@/components/admin/grading/types';

// One card per phase/track a school can independently pick a grade system
// for. A-Level splits into Principal and Subsidiary because the two are
// graded on genuinely different scales (A-E worth points vs. a 2-band
// Fail/Pass) — see grading-schemes.repository.ts.
const CARDS: { appliesTo: GradingAppliesTo; roleScope: GradeRoleScope; title: string }[] = [
  { appliesTo: 'O_LEVEL', roleScope: 'any', title: 'O-Level' },
  { appliesTo: 'A_LEVEL', roleScope: 'principal', title: 'A-Level — Principal subjects' },
  { appliesTo: 'A_LEVEL', roleScope: 'subsidiary', title: 'A-Level — Subsidiary subjects' },
];

export default function SchoolAdminGradingSchemesPage() {
  const [loading, setLoading] = useState(true);
  const [curriculumId, setCurriculumId] = useState('');
  const [selections, setSelections] = useState<SchoolGradingSchemeSelection[]>([]);
  const [changeModal, setChangeModal] = useState<(typeof CARDS)[number] | null>(null);

  const load = useCallback(async () => {
    setSelections(await fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes'));
  }, []);

  useEffect(() => {
    void (async () => {
      const schoolCurricula = await fetchList<{ curriculumId: string }>('/api/v1/academic/school-curricula');
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
        <p className="text-sm text-text-muted">
          How raw scores turn into grades — pick from the schemes a super-admin has published for your
          curriculum. Your school no longer defines its own bands here.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((card) => {
          const sel = selectionFor(card.appliesTo, card.roleScope);
          return (
            <Card key={`${card.appliesTo}-${card.roleScope}`} className="space-y-3">
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

              {sel && (
                <div>
                  <p className="font-medium text-primary-900">{sel.scheme.name}</p>
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
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => setChangeModal(card)}
                disabled={!curriculumId}
                className="w-full"
              >
                <Settings2 className="w-4 h-4 mr-1.5" aria-hidden />
                Change Grade System
              </Button>
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
    </div>
  );
}
