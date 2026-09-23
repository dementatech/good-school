'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne, submitJson } from '@/lib/api/envelope';
import { ReviewPanel } from './ReviewPanel';
import { COVERAGE_LABEL, type Coverage, type Scheme, type SchemeWeek } from './types';

const PLAN_FIELDS: { key: keyof SchemeWeek & string; label: string; wide?: boolean }[] = [
  { key: 'topic', label: 'Topic' },
  { key: 'subTopic', label: 'Sub-topic' },
  { key: 'competences', label: 'Competences / objectives', wide: true },
  { key: 'methods', label: 'Methods' },
  { key: 'materials', label: 'Materials' },
  { key: 'references', label: 'References' },
  { key: 'remarks', label: 'Remarks' },
];

type WeekDraft = Record<string, string>;

/**
 * A scheme of work: the term planned week by week, and alongside it the record
 * of work — what was actually covered each week. The teacher edits the plan
 * while it's a draft (or returned); the record of work any time. The DOS
 * approves or returns the plan and checks each week's record.
 */
export function SchemeView({ schemeId, mode, backHref }: { schemeId: string; mode: 'teacher' | 'admin'; backHref: string }) {
  const toast = useToast();
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [tab, setTab] = useState<'plan' | 'record'>('plan');
  const [drafts, setDrafts] = useState<Record<number, WeekDraft>>({});
  const [saving, setSaving] = useState(false);

  const apply = (s: Scheme | null | undefined) => {
    if (!s) return;
    setScheme(s);
    setDrafts({});
  };

  const load = useCallback(async () => {
    apply(await fetchOne<Scheme>(`/api/v1/lesson-prep/schemes/${schemeId}`, toast.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!scheme) {
    return (
      <div className="py-12 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }

  const valueOf = (w: SchemeWeek, key: string) => drafts[w.weekNumber]?.[key] ?? ((w as unknown as Record<string, string | null>)[key] ?? '');
  const setField = (week: number, key: string, value: string) =>
    setDrafts((d) => ({ ...d, [week]: { ...d[week], [key]: value } }));
  const dirty = Object.keys(drafts).length > 0;

  async function savePlan() {
    setSaving(true);
    const weeks = Object.entries(drafts).map(([weekNumber, fields]) => ({ weekNumber: Number(weekNumber), ...fields }));
    const res = await submitJson<Scheme>(`/api/v1/lesson-prep/schemes/${schemeId}/weeks`, 'PUT', { weeks });
    setSaving(false);
    if (res.ok) {
      toast.success('Scheme saved.');
      apply(res.data);
    } else toast.error(res.error!);
  }

  async function submit() {
    if (dirty) await savePlan();
    const res = await submitJson<Scheme>(`/api/v1/lesson-prep/schemes/${schemeId}/submit`, 'POST');
    if (res.ok) {
      toast.success('Submitted for review.');
      apply(res.data);
    } else toast.error(res.error!);
  }

  async function review(decision: 'approve' | 'return', comment: string) {
    const res = await submitJson<Scheme>(`/api/v1/lesson-prep/schemes/${schemeId}/review`, 'POST', {
      decision,
      comment: comment || null,
    });
    if (res.ok) {
      toast.success(decision === 'approve' ? 'Scheme approved.' : 'Returned to the teacher.');
      apply(res.data);
    } else toast.error(res.error!);
  }

  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-sm text-primary-700 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">
            {scheme.subjectName} <span className="font-normal text-text-muted">· {scheme.className}</span>
          </h1>
          <p className="text-sm text-text-muted">
            Scheme of work · {scheme.termName}
            {mode === 'admin' ? ` · ${scheme.teacherName}` : ''} · {scheme.weeksPlanned} of {scheme.weeks} weeks
            planned · {scheme.weeksRecorded} recorded
          </p>
        </div>
        {mode === 'teacher' && scheme.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button inline variant="outline" onClick={() => void savePlan()} isLoading={saving} disabled={!dirty}>
              Save
            </Button>
            <Button inline onClick={() => void submit()} disabled={scheme.weeksPlanned === 0 && !dirty}>
              <Send className="w-4 h-4 mr-1.5" aria-hidden />
              Submit for review
            </Button>
          </div>
        )}
      </div>

      <ReviewPanel
        status={scheme.status}
        reviewComment={scheme.reviewComment}
        reviewedByName={scheme.reviewedByName}
        canReview={mode === 'admin'}
        onReview={review}
      />

      <Tabs
        tabs={[
          { key: 'plan', label: 'Scheme (plan)' },
          { key: 'record', label: 'Record of work', count: scheme.weeksRecorded },
        ]}
        active={tab}
        onChange={(k) => setTab(k as 'plan' | 'record')}
      />

      {tab === 'plan' ? (
        <div className="space-y-3">
          {scheme.weekList.map((w) => (
            <Card key={w.id} className="space-y-2">
              <p className="text-sm font-bold text-primary-900">Week {w.weekNumber}</p>
              {scheme.canEdit && mode === 'teacher' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PLAN_FIELDS.map((f) => (
                    <label key={f.key} className={`block ${f.wide ? 'md:col-span-2' : ''}`}>
                      <span className="block text-xs text-text-muted mb-0.5">{f.label}</span>
                      <textarea
                        rows={f.wide ? 2 : 1}
                        value={valueOf(w, f.key)}
                        onChange={(e) => setField(w.weekNumber, f.key, e.target.value)}
                        className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm resize-y"
                      />
                    </label>
                  ))}
                </div>
              ) : w.topic ? (
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {PLAN_FIELDS.filter((f) => valueOf(w, f.key)).map((f) => (
                    <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                      <dt className="text-xs text-text-muted">{f.label}</dt>
                      <dd className="text-primary-900 whitespace-pre-line">{valueOf(w, f.key)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-text-faint">Not planned.</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {scheme.weekList.map((w) => (
            <RecordOfWorkWeek key={w.id} week={w} mode={mode} onChanged={apply} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordOfWorkWeek({
  week,
  mode,
  onChanged,
}: {
  week: SchemeWeek;
  mode: 'teacher' | 'admin';
  onChanged: (s: Scheme | undefined) => void;
}) {
  const toast = useToast();
  const [work, setWork] = useState(week.workCovered ?? '');
  const [coverage, setCoverage] = useState<Coverage | ''>(week.coverage ?? '');
  const [remarks, setRemarks] = useState(week.coverageRemarks ?? '');
  const [busy, setBusy] = useState(false);
  const dirty =
    work !== (week.workCovered ?? '') || coverage !== (week.coverage ?? '') || remarks !== (week.coverageRemarks ?? '');

  async function save() {
    setBusy(true);
    const res = await submitJson<Scheme>(`/api/v1/lesson-prep/weeks/${week.id}/record`, 'PUT', {
      workCovered: work.trim() || null,
      coverage: coverage || null,
      coverageRemarks: remarks.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Week ${week.weekNumber} recorded.`);
      onChanged(res.data);
    } else toast.error(res.error!);
  }

  async function check(checked: boolean) {
    setBusy(true);
    const res = await submitJson<Scheme>(`/api/v1/lesson-prep/weeks/${week.id}/check`, 'POST', { checked });
    setBusy(false);
    if (res.ok) onChanged(res.data);
    else toast.error(res.error!);
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-primary-900">
          Week {week.weekNumber}
          {week.topic && <span className="font-normal text-text-muted"> · planned: {week.topic}</span>}
        </p>
        {week.checkedAt ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Checked by {week.checkedByName}
            {mode === 'admin' && (
              <button type="button" onClick={() => void check(false)} className="ml-2 text-text-faint hover:underline">
                undo
              </button>
            )}
          </span>
        ) : (
          mode === 'admin' &&
          week.workCovered && (
            <Button inline variant="outline" onClick={() => void check(true)} isLoading={busy}>
              Mark as checked
            </Button>
          )
        )}
      </div>
      {mode === 'teacher' ? (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2">
          <label className="block">
            <span className="block text-xs text-text-muted mb-0.5">Work covered</span>
            <textarea
              rows={2}
              value={work}
              onChange={(e) => setWork(e.target.value)}
              className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="space-y-2">
            <label className="block">
              <span className="block text-xs text-text-muted mb-0.5">Coverage</span>
              <select
                value={coverage}
                onChange={(e) => setCoverage(e.target.value as Coverage | '')}
                className="w-full border border-border rounded-lg px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {(Object.keys(COVERAGE_LABEL) as Coverage[]).map((c) => (
                  <option key={c} value={c}>
                    {COVERAGE_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks (e.g. why not covered)"
              className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm"
            />
            <Button inline onClick={() => void save()} isLoading={busy} disabled={!dirty}>
              Save week {week.weekNumber}
            </Button>
          </div>
        </div>
      ) : week.workCovered ? (
        <div className="text-sm">
          <p className="text-primary-900 whitespace-pre-line">{week.workCovered}</p>
          <p className="text-xs text-text-muted mt-1">
            {week.coverage ? COVERAGE_LABEL[week.coverage] : 'Coverage not stated'}
            {week.coverageRemarks ? ` · ${week.coverageRemarks}` : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-faint">Nothing recorded yet.</p>
      )}
    </Card>
  );
}
