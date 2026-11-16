'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/loader';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { SECTION_LABEL, SECTION_LEVELS, useSchoolSections, type SchoolLevel } from '@/lib/levels';
import type { SchoolExam } from '@/components/admin/exams/types';
import {
  StudentReportCardSheet,
  bandsFrom,
  buildCardParts,
  defaultReportCardFields,
  type ExamReportCard,
  type NurseryRatings,
  type SchoolGradingSchemeSelection,
  type SchoolInfo,
  type Sheet,
} from '@/components/admin/report-cards/ReportCardSheet';
import { StyleEditor } from '@/components/admin/report-cards/StyleEditor';
import { CanvasEditor } from '@/components/admin/report-cards/CanvasEditor';
import type { ReportCardTemplate, TemplateDesign, TemplateListing } from '@/components/admin/report-cards/templates';
import { ArrowLeft, Check, Copy, LayoutTemplate, PenTool, Plus, Star, Trash2 } from 'lucide-react';

// Report card templates — a library per section (Nursery, Primary, Secondary):
// ready-made templates, and the school's own made from them. Each section has
// a default; Report Card Studio can print with any of them. A school's own
// template is either styled (choose what shows, colours, frame, wording) or a
// page layout (drag every block where you want it on the A4 page).

interface SectionSettings {
  section: string;
  showPositions: boolean;
}
interface AcademicYear {
  id: string;
  isCurrent: boolean;
}
interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: SchoolLevel;
}

const KIND_LABEL = { styled: 'Styled', canvas: 'Page layout' } as const;

export default function ReportCardTemplatesPage() {
  const toast = useToast();
  const { active: section } = useSchoolSections();

  const [listing, setListing] = useState<TemplateListing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; design: TemplateDesign } | null>(null);
  const [saving, setSaving] = useState(false);
  const [canvasTab, setCanvasTab] = useState<'layout' | 'style' | 'preview'>('layout');
  const [creating, setCreating] = useState<{ from: ReportCardTemplate; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ReportCardTemplate | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [showPositions, setShowPositions] = useState(true);

  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [schemes, setSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
  const [exam, setExam] = useState<SchoolExam | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [report, setReport] = useState<ExamReportCard | null>(null);
  const [studentId, setStudentId] = useState('');
  const [ratings, setRatings] = useState<{
    learningAreas: { id: string; name: string }[];
    pupils: { studentUserId: string; ratings: NurseryRatings['ratings'] }[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  /** Reloads the section's templates and selects `select`, else the current
   * one, else the default (`fresh` skips the current one: a new section). */
  async function loadTemplates(select?: string, fresh = false) {
    if (!section) return;
    const list = await fetchList<TemplateListing>(`/api/v1/academic/report-card-templates?section=${section}`, toast.error);
    applyListing(list[0] ?? null, select, fresh);
  }

  function applyListing(mine: TemplateListing | null, select?: string, fresh = false) {
    setListing(mine);
    const id = select ?? (fresh ? null : selectedId) ?? mine?.defaultId ?? null;
    const chosen = mine?.templates.find((t) => t.id === id) ?? mine?.templates[0] ?? null;
    setSelectedId(chosen?.id ?? null);
    setDraft(chosen && !chosen.builtIn ? { name: chosen.name, design: chosen.design } : null);
  }

  useEffect(() => {
    if (!section) return;
    void (async () => {
      const list = await fetchList<TemplateListing>(`/api/v1/academic/report-card-templates?section=${section}`, toast.error);
      applyListing(list[0] ?? null, undefined, true);
    })();
    void (async () => {
      const settings = await fetchList<SectionSettings>('/api/v1/academic/section-settings', toast.error);
      setShowPositions(settings.find((s) => s.section === section)?.showPositions ?? section !== 'KINDERGARTEN');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // A real learner to preview: the latest exam with results in this section.
  useEffect(() => {
    if (!section) return;
    void (async () => {
      setLoadingPreview(true);
      const [school, gradingSchemes, years] = await Promise.all([
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
        fetchList<AcademicYear>('/api/v1/academic/years', toast.error),
      ]);
      setSchoolInfo(school);
      setSchemes(gradingSchemes);
      const year = years.find((y) => y.isCurrent) ?? years[0];
      if (!year) {
        setLoadingPreview(false);
        return;
      }
      const [exams, classList] = await Promise.all([
        fetchList<SchoolExam>(`/api/v1/exams?academicYearId=${year.id}`, toast.error),
        fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${year.id}`, toast.error),
      ]);
      const mine = classList.filter((c) => SECTION_LEVELS[section].includes(c.stagePhase));
      const published = exams.filter((e) => e.publishedAt).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
      setExam(published[0] ?? exams[0] ?? null);
      setClasses(mine);
      setClassId(mine[mine.length - 1]?.id ?? '');
      if (!mine.length) setLoadingPreview(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (!exam || !classId) return;
    void (async () => {
      setLoadingPreview(true);
      const data = await fetchOne<ExamReportCard>(`/api/v1/exams/${exam.id}/report-card?classId=${classId}`, toast.error);
      setReport(data);
      // Prefer a learner with a photo, so the photo box shows what it does.
      setStudentId((data?.students.find((s) => s.photoUrl) ?? data?.students[0])?.studentUserId ?? '');
      const nurseryBoth =
        data?.class.phase === 'KINDERGARTEN' &&
        schoolInfo?.sectionSettings?.find((x) => x.section === 'KINDERGARTEN')?.assessmentStyle === 'both';
      setRatings(
        nurseryBoth ? await fetchOne(`/api/v1/early-years/sheet?classId=${classId}&termId=${data!.exam.termId}`, toast.error) : null,
      );
      setLoadingPreview(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, classId, schoolInfo]);

  const bands = useMemo(() => bandsFrom(schemes), [schemes]);
  const selected = listing?.templates.find((t) => t.id === selectedId) ?? null;
  const design = draft?.design ?? selected?.design ?? null;
  const dirty =
    !!selected &&
    !selected.builtIn &&
    !!draft &&
    (draft.name !== selected.name || JSON.stringify(draft.design) !== JSON.stringify(selected.design));
  const student = report?.students.find((s) => s.studentUserId === studentId) ?? null;

  const sheet: Sheet | null =
    report && student && section && selected && design
      ? {
          student,
          exam: report.exam,
          klass: report.class,
          stream: null,
          aggregation: report.aggregation,
          totalInClass: report.students.length,
          showPositions,
          fields: { ...defaultReportCardFields(section), ...design.fields },
          nurseryRatings: ratings
            ? {
                areas: ratings.learningAreas,
                ratings: ratings.pupils.find((p) => p.studentUserId === student.studentUserId)?.ratings ?? {},
              }
            : null,
          template: { ...selected, design },
        }
      : null;
  const parts = sheet && design ? buildCardParts(sheet, schoolInfo, bands, design) : null;

  function select(id: string) {
    if (id === selectedId) return;
    if (dirty) {
      setSwitchTo(id);
      return;
    }
    const t = listing?.templates.find((x) => x.id === id);
    setSelectedId(id);
    setDraft(t && !t.builtIn ? { name: t.name, design: t.design } : null);
    setCanvasTab('layout');
  }

  async function save() {
    if (!selected || !draft) return;
    setSaving(true);
    const res = await submitJson<ReportCardTemplate>(`/api/v1/academic/report-card-templates/${selected.id}`, 'PUT', {
      name: draft.name,
      design: draft.design,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success('Template saved.');
    await loadTemplates(selected.id);
  }

  async function create() {
    if (!creating || !section) return;
    setSaving(true);
    const res = await submitJson<ReportCardTemplate>('/api/v1/academic/report-card-templates', 'POST', {
      section,
      name: creating.name,
      kind: creating.from.kind,
      design: creating.from.design,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    setCreating(null);
    toast.success('Template created — make it your own.');
    await loadTemplates(res.data!.id);
  }

  async function makeDefault(t: ReportCardTemplate) {
    if (!section) return;
    const res = await submitJson('/api/v1/academic/report-card-templates/default', 'PUT', { section, templateId: t.id });
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success(`${SECTION_LABEL[section]} report cards now print with “${t.name}”.`);
    await loadTemplates(selectedId ?? undefined);
  }

  async function remove() {
    if (!deleting) return;
    const res = await submitJson(`/api/v1/academic/report-card-templates/${deleting.id}`, 'DELETE');
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success('Template deleted.');
    const wasSelected = deleting.id === selectedId;
    setDeleting(null);
    if (wasSelected) setSelectedId(null);
    await loadTemplates(wasSelected ? listing?.defaultId : selectedId ?? undefined);
  }

  async function savePositions(value: boolean) {
    if (!section) return;
    setShowPositions(value);
    const res = await submitJson('/api/v1/academic/section-settings', 'PUT', { section, showPositions: value });
    if (!res.ok) {
      toast.error(res.error!);
      setShowPositions(!value);
    }
  }

  function startCopy(from: ReportCardTemplate) {
    const taken = new Set(listing?.templates.map((t) => t.name.toLowerCase()));
    let name = from.builtIn ? `Our ${from.name}` : `${from.name} (copy)`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${from.builtIn ? `Our ${from.name}` : `${from.name} (copy)`} ${n}`;
    setCreating({ from: draft && from.id === selectedId ? { ...from, design: draft.design } : from, name });
  }

  if (!section || !listing) {
    return (
      <div className="py-16 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }

  const builtIns = listing.templates.filter((t) => t.builtIn);
  const own = listing.templates.filter((t) => !t.builtIn);

  const previewControls = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-primary-900 mr-1">Preview</span>
      {classes.length > 0 && (
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label="Class to preview"
          className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.stageName}
            </option>
          ))}
        </select>
      )}
      {report && report.students.length > 0 && (
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          aria-label="Learner to preview"
          className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900 max-w-[16rem]"
        >
          {report.students.map((s) => (
            <option key={s.studentUserId} value={s.studentUserId}>
              {s.studentName}
            </option>
          ))}
        </select>
      )}
      {exam && (
        <span className="text-xs text-text-muted">
          {exam.name} · {exam.termName}
        </span>
      )}
    </div>
  );

  const preview = loadingPreview ? (
    <div className="py-16 flex justify-center">
      <Loader size={44} />
    </div>
  ) : sheet ? (
    <div className="rounded-card border border-border bg-bg-canvas p-3 overflow-x-auto">
      <div className="min-w-[640px] w-fit mx-auto">
        <StudentReportCardSheet sheet={sheet} schoolInfo={schoolInfo} {...bands} />
      </div>
    </div>
  ) : (
    <Card>
      <p className="text-sm text-text-muted text-center py-10">
        The preview shows a learner&apos;s card once this section has an exam and learners. You can still set up templates now.
      </p>
    </Card>
  );

  const templateRow = (t: ReportCardTemplate) => {
    const isDefault = t.id === listing.defaultId;
    return (
      <li key={t.id}>
        <div
          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer ${
            t.id === selectedId ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-bg-subtle'
          }`}
          onClick={() => select(t.id)}
        >
          {t.kind === 'canvas' ? (
            <PenTool className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
          ) : (
            <LayoutTemplate className="w-4 h-4 mt-0.5 text-text-muted shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-900 truncate">{t.name}</p>
            {t.description && <p className="text-xs text-text-muted leading-snug">{t.description}</p>}
            <div className="flex flex-wrap gap-1 mt-1">
              {isDefault && <Badge variant="success">Default</Badge>}
              {!t.builtIn && <Badge variant="muted">{KIND_LABEL[t.kind]}</Badge>}
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu
              label={`Actions for ${t.name}`}
              items={[
                { label: 'Use by default', icon: Star, onClick: () => void makeDefault(t), disabled: isDefault },
                { label: t.builtIn ? 'Customise a copy' : 'Duplicate', icon: Copy, onClick: () => startCopy(t) },
                ...(!t.builtIn ? [{ label: 'Delete', icon: Trash2, onClick: () => setDeleting(t), danger: true, separatorBefore: true }] : []),
              ]}
            />
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/school-admin/report-card-studio" className="text-sm text-primary-700 inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Report Card Studio
          </Link>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight">Report card templates — {SECTION_LABEL[section]}</h1>
          <p className="text-sm text-text-muted mt-1 max-w-prose">
            Pick a ready-made template or design your own. The default prints unless you choose another in Report Card Studio.
          </p>
        </div>
        <Button
          inline
          onClick={() => {
            const base = listing.templates.find((t) => t.id === listing.defaultId) ?? builtIns[0];
            if (base) startCopy(base);
          }}
        >
          <Plus className="w-4 h-4" aria-hidden /> New template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-6 items-start">
        <Card className="lg:sticky lg:top-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-faint mb-1.5">Ready-made</p>
            <ul className="space-y-0.5">{builtIns.map(templateRow)}</ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-faint mb-1.5">Your templates</p>
            {own.length > 0 ? (
              <ul className="space-y-0.5">{own.map(templateRow)}</ul>
            ) : (
              <p className="text-xs text-text-muted px-1">
                None yet. Choose <span className="font-semibold">Customise a copy</span> on a ready-made one to start.
              </p>
            )}
          </div>
        </Card>

        {selected && design && (
          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {draft ? (
                <input
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-label="Template name"
                  className="h-10 min-w-[16rem] rounded-lg border border-border-strong px-3 text-lg font-bold text-primary-900"
                />
              ) : (
                <div>
                  <p className="text-lg font-bold text-primary-900">{selected.name}</p>
                  <p className="text-xs text-text-muted">Ready-made templates can&apos;t be changed — customise a copy to make it yours.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {selected.id !== listing.defaultId && (
                  <Button variant="outline" inline onClick={() => void makeDefault(selected)} disabled={dirty}>
                    <Star className="w-4 h-4" aria-hidden /> Use by default
                  </Button>
                )}
                {selected.builtIn ? (
                  <Button inline onClick={() => startCopy(selected)}>
                    <Copy className="w-4 h-4" aria-hidden /> Customise a copy
                  </Button>
                ) : (
                  <Button inline onClick={() => void save()} isLoading={saving} disabled={!dirty || saving}>
                    {dirty ? (
                      'Save template'
                    ) : (
                      <>
                        <Check className="w-4 h-4" aria-hidden /> Saved
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {selected.builtIn ? (
              <div className="space-y-3">
                {previewControls}
                {preview}
              </div>
            ) : selected.kind === 'canvas' && draft ? (
              <div className="space-y-3">
                <div className="inline-flex rounded-lg border border-border-strong overflow-hidden">
                  {(
                    [
                      ['layout', 'Page layout'],
                      ['style', 'Style & wording'],
                      ['preview', 'Preview'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCanvasTab(key)}
                      className={`px-3.5 h-9 text-sm font-semibold ${canvasTab === key ? 'bg-primary-700 text-white' : 'text-primary-900 hover:bg-primary-50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {canvasTab !== 'style' && previewControls}
                {canvasTab === 'layout' && (
                  <CanvasEditor design={draft.design} parts={parts} onChange={(blocks) => setDraft({ ...draft, design: { ...draft.design, blocks } })} />
                )}
                {canvasTab === 'style' && (
                  <Card className="max-w-xl">
                    <StyleEditor
                      section={section}
                      kind="canvas"
                      design={draft.design}
                      onChange={(d) => setDraft({ ...draft, design: d })}
                      showPositions={showPositions}
                      onShowPositions={(v) => void savePositions(v)}
                    />
                  </Card>
                )}
                {canvasTab === 'preview' && preview}
              </div>
            ) : draft ? (
              <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5 items-start">
                <Card className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                  <StyleEditor
                    section={section}
                    kind="styled"
                    design={draft.design}
                    onChange={(d) => setDraft({ ...draft, design: d })}
                    showPositions={showPositions}
                    onShowPositions={(v) => void savePositions(v)}
                  />
                </Card>
                <div className="space-y-3 min-w-0">
                  {previewControls}
                  {preview}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Modal open={!!creating} onClose={() => setCreating(null)} title="New template">
        {creating && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">Name</span>
              <input
                value={creating.name}
                maxLength={60}
                onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                className="w-full h-10 rounded-lg border border-border-strong px-3 text-sm"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-muted mb-1">Start from</span>
              <select
                value={creating.from.id}
                onChange={(e) => {
                  const from = listing.templates.find((t) => t.id === e.target.value);
                  if (from) setCreating({ ...creating, from });
                }}
                className="w-full h-10 rounded-lg border border-border-strong px-3 text-sm"
              >
                {listing.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.builtIn ? '' : ' (yours)'} — {KIND_LABEL[t.kind]}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-text-muted mt-1">
                {creating.from.kind === 'canvas'
                  ? 'A page layout: drag every part of the card where you want it.'
                  : 'Styled: choose what shows, colours, frame, font and wording; the layout flows top to bottom.'}
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" inline type="button" onClick={() => setCreating(null)}>
                Cancel
              </Button>
              <Button inline type="submit" isLoading={saving} disabled={!creating.name.trim() || saving}>
                Create
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete template?">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              “{deleting.name}” will be deleted.
              {deleting.id === listing.defaultId && ` ${SECTION_LABEL[section]} report cards will go back to Classic.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" inline onClick={() => setDeleting(null)}>
                Keep it
              </Button>
              <Button inline onClick={() => void remove()} className="bg-error hover:bg-error">
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!switchTo} onClose={() => setSwitchTo(null)} title="Unsaved changes">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">You have changes to “{draft?.name}” that aren&apos;t saved.</p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              inline
              onClick={() => {
                const id = switchTo!;
                const t = listing.templates.find((x) => x.id === id);
                setSwitchTo(null);
                setSelectedId(id);
                setDraft(t && !t.builtIn ? { name: t.name, design: t.design } : null);
              }}
            >
              Discard them
            </Button>
            <Button inline onClick={() => setSwitchTo(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
