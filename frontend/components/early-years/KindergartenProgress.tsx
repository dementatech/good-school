'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Baby, FileText, MessageSquareText, Plus, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastProvider';
import { Loader } from '@/components/ui/loader';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import {
  RATINGS,
  RATING_CHIP,
  RATING_LABEL,
  RATING_SHORT,
  type AssessmentSheet,
  type DevelopmentalRating,
  type EarlyYearsOverview,
  type LearningArea,
  type SheetPupil,
} from './types';

const API = '/api/v1/early-years';

type CellKey = `${string}:${string}`;
const cellKey = (studentUserId: string, areaId: string): CellKey => `${studentUserId}:${areaId}`;

// Click order for a grid cell: blank → E → D → P → blank.
function nextRating(r: DevelopmentalRating | null): DevelopmentalRating | null {
  if (r === null) return 'emerging';
  if (r === 'emerging') return 'developing';
  if (r === 'developing') return 'proficient';
  return null;
}

/**
 * Kindergarten (Baby / Middle / Top Class) progress: a pupils × learning-areas
 * grid of Emerging / Developing / Proficient ratings per term, plus each
 * pupil's term remarks and a printable progress report. No marks, no grades —
 * see docs/design/kindergarten-extension.md §3.
 *
 * Shared by the school-admin and staff portals; only a school admin manages
 * the learning-area list or writes the head teacher's remark.
 */
export function KindergartenProgress({ portal }: { portal: 'school-admin' | 'staff' }) {
  const toast = useToast();
  const isAdmin = portal === 'school-admin';
  const [tab, setTab] = useState<'assess' | 'areas'>('assess');
  const [overview, setOverview] = useState<EarlyYearsOverview | null>(null);
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [sheet, setSheet] = useState<AssessmentSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [drafts, setDrafts] = useState<Map<CellKey, DevelopmentalRating | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [pupilModal, setPupilModal] = useState<SheetPupil | null>(null);

  useEffect(() => {
    void (async () => {
      const data = await fetchOne<EarlyYearsOverview>(`${API}/overview`, toast.error);
      setOverview(data);
      setClassId(data?.classes[0]?.id ?? '');
      setTermId(data?.currentTermId ?? data?.terms[data.terms.length - 1]?.id ?? '');
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSheet = useCallback(async () => {
    if (!classId || !termId) {
      setSheet(null);
      return;
    }
    setSheetLoading(true);
    const data = await fetchOne<AssessmentSheet>(
      `${API}/sheet?classId=${classId}&termId=${termId}`,
      toast.error,
    );
    setSheet(data);
    setDrafts(new Map());
    setSheetLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, termId]);

  useEffect(() => {
    void (async () => {
      await loadSheet();
    })();
  }, [loadSheet]);

  const ratingOf = useCallback(
    (pupil: SheetPupil, areaId: string): DevelopmentalRating | null => {
      const key = cellKey(pupil.studentUserId, areaId);
      return drafts.has(key) ? drafts.get(key)! : pupil.ratings[areaId]?.rating ?? null;
    },
    [drafts],
  );

  const completion = useMemo(() => {
    if (!sheet || sheet.pupils.length === 0 || sheet.learningAreas.length === 0) return null;
    let rated = 0;
    for (const p of sheet.pupils) for (const a of sheet.learningAreas) if (ratingOf(p, a.id)) rated++;
    return Math.round((rated / (sheet.pupils.length * sheet.learningAreas.length)) * 100);
  }, [sheet, ratingOf]);

  function cycle(pupil: SheetPupil, areaId: string) {
    const key = cellKey(pupil.studentUserId, areaId);
    const next = nextRating(ratingOf(pupil, areaId));
    setDrafts((d) => {
      const copy = new Map(d);
      if (next === (pupil.ratings[areaId]?.rating ?? null)) copy.delete(key);
      else copy.set(key, next);
      return copy;
    });
  }

  // Fill every blank cell in one learning area — a quick start for a teacher
  // who then only adjusts the exceptions.
  function fillArea(areaId: string, rating: DevelopmentalRating) {
    if (!sheet) return;
    setDrafts((d) => {
      const copy = new Map(d);
      for (const p of sheet.pupils) {
        if (ratingOf(p, areaId) === null) copy.set(cellKey(p.studentUserId, areaId), rating);
      }
      return copy;
    });
  }

  async function saveGrid() {
    if (drafts.size === 0) return;
    setSaving(true);
    const entries = [...drafts.entries()].map(([key, rating]) => {
      const [studentUserId, learningAreaId] = key.split(':');
      return { studentUserId, learningAreaId, rating };
    });
    const res = await submitJson(`${API}/sheet`, 'PUT', { classId, termId, entries });
    setSaving(false);
    if (res.ok) {
      toast.success(`Saved ${entries.length} rating${entries.length === 1 ? '' : 's'}.`);
      await loadSheet();
    } else {
      toast.error(res.error!);
    }
  }

  function openReports(studentUserId?: string) {
    const qs = new URLSearchParams({ classId, termId });
    if (studentUserId) qs.set('studentId', studentUserId);
    window.open(`/${portal}/kindergarten/report?${qs.toString()}`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  const classes = overview?.classes ?? [];
  const terms = overview?.terms ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <Baby className="w-6 h-6 text-primary-700" aria-hidden />
            Kindergarten Progress
          </h1>
          <p className="text-sm text-text-muted max-w-2xl">
            Baby, Middle and Top Class are assessed through learning areas, not exams. Rate each pupil
            <strong> Emerging</strong>, <strong>Developing</strong> or <strong>Proficient</strong> every
            term, add remarks, and print a progress report for parents.
          </p>
        </div>
      </div>

      {isAdmin && (
        <Tabs
          tabs={[
            { key: 'assess', label: 'Assessment' },
            { key: 'areas', label: 'Learning areas' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'assess' | 'areas')}
        />
      )}

      {tab === 'areas' && isAdmin ? (
        <LearningAreasManager onChanged={loadSheet} />
      ) : !overview?.academicYear ? (
        <Card>
          <p className="text-sm text-text-muted">Set a current academic year first.</p>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">
            {isAdmin
              ? 'No kindergarten classes are open this year — open Baby, Middle or Top Class under Classes & Streams.'
              : "You aren't the class teacher of a kindergarten class this year."}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Select
                label="Class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c.pupilCount})` }))}
              />
            </div>
            <div className="w-40">
              <Select
                label="Term"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                options={terms.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button inline variant="outline" onClick={() => openReports()} disabled={!sheet?.pupils.length}>
                <FileText className="w-4 h-4 mr-1.5" aria-hidden />
                Print progress reports
              </Button>
              <Button inline onClick={() => void saveGrid()} disabled={drafts.size === 0} isLoading={saving}>
                <Save className="w-4 h-4 mr-1.5" aria-hidden />
                Save{drafts.size ? ` (${drafts.size})` : ''}
              </Button>
            </div>
          </div>

          {sheetLoading || !sheet ? (
            <div className="py-12 flex justify-center">
              <Loader size={44} />
            </div>
          ) : sheet.pupils.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted">No pupils are enrolled in {sheet.class.name} yet.</p>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
                <span>
                  Class teacher:{' '}
                  <strong className="text-primary-900">{sheet.class.classTeacherName ?? 'Not assigned'}</strong>
                </span>
                {completion !== null && (
                  <span>
                    Rated: <strong className="text-primary-900">{completion}%</strong>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  Click a cell to cycle
                  {RATINGS.map((r) => (
                    <span key={r} className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${RATING_CHIP[r]}`}>
                      {RATING_SHORT[r]} = {RATING_LABEL[r]}
                    </span>
                  ))}
                </span>
              </div>

              <Card className="p-0 overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-text-faint">
                      <th className="py-2.5 px-3 text-left sticky left-0 bg-bg-card z-[1] min-w-[11rem]">Pupil</th>
                      {sheet.learningAreas.map((a) => (
                        <th key={a.id} className="py-2 px-1.5 text-center align-bottom min-w-[5.5rem]">
                          <span className="block normal-case text-[11px] leading-tight text-primary-900" title={a.description ?? undefined}>
                            {a.name}
                          </span>
                          <span className="mt-1 inline-flex gap-0.5">
                            {RATINGS.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => fillArea(a.id, r)}
                                title={`Fill blanks in ${a.name} with ${RATING_LABEL[r]}`}
                                className="text-[9px] font-bold px-1 rounded border border-border text-text-faint hover:text-primary-900"
                              >
                                {RATING_SHORT[r]}
                              </button>
                            ))}
                          </span>
                        </th>
                      ))}
                      <th className="py-2.5 px-3 text-center">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.pupils.map((p) => (
                      <tr key={p.studentUserId} className="border-b border-border last:border-0">
                        <td className="py-1.5 px-3 sticky left-0 bg-bg-card z-[1]">
                          <span className="block font-medium text-primary-900 truncate max-w-[13rem]">{p.name}</span>
                          <span className="block text-[11px] text-text-faint">{p.systemId}</span>
                        </td>
                        {sheet.learningAreas.map((a) => {
                          const rating = ratingOf(p, a.id);
                          const dirty = drafts.has(cellKey(p.studentUserId, a.id));
                          return (
                            <td key={a.id} className="py-1.5 px-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => cycle(p, a.id)}
                                aria-label={`${p.name}, ${a.name}: ${rating ? RATING_LABEL[rating] : 'not rated'}`}
                                className={`w-9 h-8 rounded-md border text-xs font-extrabold transition-colors ${
                                  rating ? RATING_CHIP[rating] : 'border-dashed border-border text-text-faint hover:border-primary-700'
                                } ${dirty ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                              >
                                {rating ? RATING_SHORT[rating] : '·'}
                              </button>
                            </td>
                          );
                        })}
                        <td className="py-1.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPupilModal(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                          >
                            <MessageSquareText className="w-3.5 h-3.5" aria-hidden />
                            {p.classTeacherComment ? 'Edit' : 'Add'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openReports(p.studentUserId)}
                            className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-primary-900"
                            title="Print this pupil's progress report"
                          >
                            <FileText className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}

      {pupilModal && sheet && (
        <PupilAssessmentModal
          pupil={pupilModal}
          sheet={sheet}
          classId={classId}
          termId={termId}
          onClose={() => setPupilModal(null)}
          onSaved={async () => {
            setPupilModal(null);
            await loadSheet();
          }}
        />
      )}
    </div>
  );
}

function PupilAssessmentModal({
  pupil,
  sheet,
  classId,
  termId,
  onClose,
  onSaved,
}: {
  pupil: SheetPupil;
  sheet: AssessmentSheet;
  classId: string;
  termId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [areas, setAreas] = useState(() =>
    Object.fromEntries(
      sheet.learningAreas.map((a) => [
        a.id,
        { rating: pupil.ratings[a.id]?.rating ?? null, comment: pupil.ratings[a.id]?.comment ?? '' },
      ]),
    ) as Record<string, { rating: DevelopmentalRating | null; comment: string }>,
  );
  const [classTeacherComment, setClassTeacherComment] = useState(pupil.classTeacherComment ?? '');
  const [headTeacherComment, setHeadTeacherComment] = useState(pupil.headTeacherComment ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await submitJson(`${API}/sheet`, 'PUT', {
      classId,
      termId,
      entries: sheet.learningAreas.map((a) => ({
        studentUserId: pupil.studentUserId,
        learningAreaId: a.id,
        rating: areas[a.id].rating,
        teacherComment: areas[a.id].comment.trim() || null,
      })),
      remarks: [
        {
          studentUserId: pupil.studentUserId,
          classTeacherComment: classTeacherComment.trim() || null,
          ...(sheet.canEditHeadTeacherRemark ? { headTeacherComment: headTeacherComment.trim() || null } : {}),
        },
      ],
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`Saved ${pupil.name}'s assessment.`);
      await onSaved();
    } else {
      toast.error(res.error!);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${pupil.name} — ${sheet.term.name}`} size="lg">
      <div className="space-y-4">
        {sheet.learningAreas.map((a) => (
          <div key={a.id} className="rounded-xl border border-border p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold text-primary-900">{a.name}</p>
              {a.description && <p className="text-xs text-text-faint">{a.description}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RATINGS.map((r) => {
                const selected = areas[a.id].rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAreas((s) => ({ ...s, [a.id]: { ...s[a.id], rating: selected ? null : r } }))}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                      selected ? RATING_CHIP[r] : 'border-border text-text-muted hover:text-primary-900'
                    }`}
                  >
                    {RATING_LABEL[r]}
                  </button>
                );
              })}
            </div>
            <input
              value={areas[a.id].comment}
              onChange={(e) => setAreas((s) => ({ ...s, [a.id]: { ...s[a.id], comment: e.target.value } }))}
              placeholder="Optional note (e.g. “Can count 1–20”)"
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm"
              maxLength={1000}
            />
          </div>
        ))}

        <label className="block">
          <span className="block text-xs font-medium text-text-muted mb-1">Class teacher&apos;s remark</span>
          <textarea
            value={classTeacherComment}
            onChange={(e) => setClassTeacherComment(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </label>
        {sheet.canEditHeadTeacherRemark ? (
          <label className="block">
            <span className="block text-xs font-medium text-text-muted mb-1">Head teacher&apos;s remark</span>
            <textarea
              value={headTeacherComment}
              onChange={(e) => setHeadTeacherComment(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
        ) : (
          pupil.headTeacherComment && (
            <p className="text-xs text-text-muted">
              Head teacher: <span className="italic">&ldquo;{pupil.headTeacherComment}&rdquo;</span>
            </p>
          )
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={() => void save()} isLoading={saving}>
            Save
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LearningAreasManager({ onChanged }: { onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [areas, setAreas] = useState<LearningArea[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setAreas(await fetchList<LearningArea>(`${API}/learning-areas`, toast.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const res = await submitJson(`${API}/learning-areas`, 'POST', {
      name: name.trim(),
      description: description.trim() || null,
    });
    setAdding(false);
    if (res.ok) {
      setName('');
      setDescription('');
      await Promise.all([load(), onChanged()]);
    } else {
      toast.error(res.error!);
    }
  }

  async function toggle(area: LearningArea) {
    const res = await submitJson(`${API}/learning-areas/${area.id}`, 'PUT', {
      name: area.name,
      description: area.description,
      isActive: !area.isActive,
    });
    if (res.ok) await Promise.all([load(), onChanged()]);
    else toast.error(res.error!);
  }

  async function remove(area: LearningArea) {
    if (!confirm(`Delete “${area.name}”?`)) return;
    const res = await submitJson(`${API}/learning-areas/${area.id}`, 'DELETE');
    if (res.ok) await Promise.all([load(), onChanged()]);
    else toast.error(res.error!);
  }

  if (!areas) {
    return (
      <div className="py-12 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted max-w-2xl">
        The areas every kindergarten pupil is rated on. These start from the national early-childhood
        framework; rename, add or retire them to match how your school teaches. Retired areas keep their
        past ratings but stop appearing on new assessments.
      </p>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-text-faint">
              <th className="py-2.5 px-4">Learning area</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="py-2.5 px-4">
                  <span className="block font-medium text-primary-900">{a.name}</span>
                  {a.description && <span className="block text-xs text-text-faint">{a.description}</span>}
                </td>
                <td className="py-2.5 px-4">
                  <Badge variant={a.isActive ? 'success' : 'muted'}>{a.isActive ? 'In use' : 'Retired'}</Badge>
                </td>
                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void toggle(a)}
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    {a.isActive ? 'Retire' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    aria-label={`Delete ${a.name}`}
                    className="ml-3 text-text-faint hover:text-error align-middle"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <p className="text-sm font-medium text-primary-900 mb-2">Add a learning area</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2 items-end">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Religious & Moral Values" />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What pupils practise in this area"
          />
          <Button inline onClick={() => void add()} isLoading={adding} disabled={!name.trim()}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
