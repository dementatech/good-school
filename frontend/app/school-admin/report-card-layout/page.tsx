'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/loader';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { SECTION_LABEL, SECTION_LEVELS, useSchoolSections } from '@/lib/levels';
import { generateSampleReport } from '@/lib/reports/sample-report';
import {
  StudentReportCardSheet,
  bandsFrom,
  defaultReportCardFields,
  type SchoolGradingSchemeSelection,
  type SchoolInfo,
} from '@/components/admin/report-cards/ReportCardSheet';
import type { ReportCardTemplate, TemplateListing } from '@/components/admin/report-cards/templates';
import { ArrowLeft, Copy, LayoutTemplate, PenTool, Plus, Shuffle, Star, Trash2, Wand2 } from 'lucide-react';

// Report card templates — a library per section (Nursery, Primary, Secondary):
// ready-made templates, and the school's own made from them. Each section has
// a default, and Report Card Studio can print with any of them. The school's
// own templates open in the Report Designer; here they're previewed on a
// made-up learner (shuffle for another).

const KIND_LABEL = { styled: 'Styled', canvas: 'Page layout' } as const;

export default function ReportCardTemplatesPage() {
  const toast = useToast();
  const router = useRouter();
  const { active: section } = useSchoolSections();

  const [listing, setListing] = useState<TemplateListing | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ from: ReportCardTemplate; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ReportCardTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [schemes, setSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
  const [showPositions, setShowPositions] = useState(true);
  const [seed, setSeed] = useState(1);

  async function reload(select?: string) {
    if (!section) return;
    const list = await fetchList<TemplateListing>(`/api/v1/academic/report-card-templates?section=${section}`, toast.error);
    const mine = list[0] ?? null;
    setListing(mine);
    setSelectedId((prev) => {
      const want = select ?? prev ?? mine?.defaultId ?? null;
      return mine?.templates.some((t) => t.id === want) ? want : mine?.defaultId ?? null;
    });
  }

  useEffect(() => {
    if (!section) return;
    void (async () => {
      const [list, school, gradingSchemes, settings] = await Promise.all([
        fetchList<TemplateListing>(`/api/v1/academic/report-card-templates?section=${section}`, toast.error),
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
        fetchList<{ section: string; showPositions: boolean }>('/api/v1/academic/section-settings', toast.error),
      ]);
      const mine = list[0] ?? null;
      setListing(mine);
      setSelectedId(mine?.defaultId ?? null);
      setSchoolInfo(school);
      setSchemes(gradingSchemes);
      setShowPositions(settings.find((s) => s.section === section)?.showPositions ?? section !== 'KINDERGARTEN');
      setSeed(Math.floor(Math.random() * 1e6));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const bands = useMemo(() => bandsFrom(schemes), [schemes]);
  const selected = listing?.templates.find((t) => t.id === selectedId) ?? null;

  const preview = useMemo(() => {
    if (!selected || !section) return null;
    const fields = { ...defaultReportCardFields(section), ...selected.design.fields };
    const sample = generateSampleReport({
      level: SECTION_LEVELS[section][0],
      seed,
      bands,
      examRule: selected.design.rules.exams,
      fields,
      showPositions,
    });
    return { sheet: { ...sample.sheet, template: selected }, school: schoolInfo ?? sample.schoolInfo };
  }, [selected, section, seed, bands, showPositions, schoolInfo]);

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
    router.push(`/school-admin/report-card-designer/${res.data!.id}`);
  }

  async function makeDefault(t: ReportCardTemplate) {
    if (!section) return;
    const res = await submitJson('/api/v1/academic/report-card-templates/default', 'PUT', { section, templateId: t.id });
    if (!res.ok) {
      toast.error(res.error!);
      return;
    }
    toast.success(`${SECTION_LABEL[section]} report cards now print with “${t.name}”.`);
    await reload(selectedId ?? undefined);
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
    await reload(wasSelected ? listing?.defaultId : undefined);
  }

  function startCopy(from: ReportCardTemplate) {
    const taken = new Set(listing?.templates.map((t) => t.name.toLowerCase()));
    const stem = from.builtIn ? `Our ${from.name}` : `${from.name} (copy)`;
    let name = stem;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} ${n}`;
    setCreating({ from, name });
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

  const templateRow = (t: ReportCardTemplate) => {
    const isDefault = t.id === listing.defaultId;
    return (
      <li key={t.id}>
        <div
          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer ${t.id === selectedId ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-bg-subtle'}`}
          onClick={() => setSelectedId(t.id)}
          onDoubleClick={() => !t.builtIn && router.push(`/school-admin/report-card-designer/${t.id}`)}
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
                ...(!t.builtIn ? [{ label: 'Open in designer', icon: Wand2, onClick: () => router.push(`/school-admin/report-card-designer/${t.id}`) }] : []),
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
            Pick a ready-made template or design your own in the Report Designer. The default prints unless you choose another in Report Card
            Studio.
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

        {selected && (
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-primary-900">{selected.name}</p>
                <p className="text-xs text-text-muted">
                  {selected.builtIn ? 'Ready-made — customise a copy to change it.' : `${KIND_LABEL[selected.kind]} · double-click to open in the designer.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" inline onClick={() => setSeed((s) => s + 1)}>
                  <Shuffle className="w-4 h-4" aria-hidden /> Another learner
                </Button>
                {selected.id !== listing.defaultId && (
                  <Button variant="outline" inline onClick={() => void makeDefault(selected)}>
                    <Star className="w-4 h-4" aria-hidden /> Use by default
                  </Button>
                )}
                {selected.builtIn ? (
                  <Button inline onClick={() => startCopy(selected)}>
                    <Copy className="w-4 h-4" aria-hidden /> Customise a copy
                  </Button>
                ) : (
                  <Button inline onClick={() => router.push(`/school-admin/report-card-designer/${selected.id}`)}>
                    <Wand2 className="w-4 h-4" aria-hidden /> Open in designer
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-text-muted">Preview with a made-up learner — no real marks are shown here.</p>
            {preview && (
              <div className="rounded-card border border-border bg-bg-canvas p-3 overflow-x-auto">
                <div className="min-w-[640px] w-fit mx-auto">
                  <StudentReportCardSheet sheet={preview.sheet} schoolInfo={preview.school} {...bands} />
                </div>
              </div>
            )}
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
                  ? 'A page layout: place every part of the card, add text boxes and data fields, and set rules for when they show.'
                  : 'Styled: choose what shows, colours, frame, font, wording and rules; the layout flows top to bottom.'}
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" inline type="button" onClick={() => setCreating(null)}>
                Cancel
              </Button>
              <Button inline type="submit" isLoading={saving} disabled={!creating.name.trim() || saving}>
                Create and open designer
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
    </div>
  );
}
