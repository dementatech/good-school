'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { ReviewPanel } from './ReviewPanel';
import { fmtDate, type LessonPlan, type Scheme, type TeachingAssignment } from './types';

const SECTIONS: { key: keyof Form; label: string; rows: number; hint?: string }[] = [
  { key: 'objectives', label: 'Objectives / competences', rows: 3, hint: 'By the end of the lesson, learners should be able to…' },
  { key: 'materials', label: 'Teaching and learning materials', rows: 2 },
  { key: 'introduction', label: 'Introduction', rows: 3 },
  { key: 'development', label: 'Lesson development', rows: 5 },
  { key: 'conclusion', label: 'Conclusion', rows: 2 },
  { key: 'assessment', label: 'Assessment / evaluation of learners', rows: 2 },
];

interface Form {
  lessonDate: string;
  topic: string;
  subTopic: string;
  objectives: string;
  materials: string;
  introduction: string;
  development: string;
  conclusion: string;
  assessment: string;
  selfEvaluation: string;
  schemeWeekId: string;
}

const emptyForm = (date: string): Form => ({
  lessonDate: date,
  topic: '',
  subTopic: '',
  objectives: '',
  materials: '',
  introduction: '',
  development: '',
  conclusion: '',
  assessment: '',
  selfEvaluation: '',
  schemeWeekId: '',
});

// Today's date in East Africa Time.
const todayInEAT = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export interface PlanPrefill {
  classId?: string;
  subjectId?: string;
  streamId?: string;
  timetableSlotId?: string;
  lessonDate?: string;
}

/**
 * One lesson plan. A teacher writes it (from a timetabled lesson or from
 * scratch, optionally tied to a scheme-of-work week, which pre-fills the
 * topic), submits it, and adds a self-evaluation after teaching — editable even
 * once approved. The DOS reads it and approves or returns it.
 */
export function PlanView({
  planId,
  mode,
  backHref,
  prefill,
}: {
  planId: string | 'new';
  mode: 'teacher' | 'admin';
  backHref: string;
  prefill?: PlanPrefill;
}) {
  const toast = useToast();
  const router = useRouter();
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(prefill?.lessonDate ?? todayInEAT()));
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
  const [pair, setPair] = useState(prefill?.classId && prefill.subjectId ? `${prefill.classId}:${prefill.subjectId}` : '');
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isNew = planId === 'new';

  useEffect(() => {
    void (async () => {
      if (!isNew) {
        const p = await fetchOne<LessonPlan>(`/api/v1/lesson-prep/plans/${planId}`, toast.error);
        setPlan(p);
        if (p) {
          setForm({
            lessonDate: p.lessonDate,
            topic: p.topic,
            subTopic: p.subTopic ?? '',
            objectives: p.objectives ?? '',
            materials: p.materials ?? '',
            introduction: p.introduction ?? '',
            development: p.development ?? '',
            conclusion: p.conclusion ?? '',
            assessment: p.assessment ?? '',
            selfEvaluation: p.selfEvaluation ?? '',
            schemeWeekId: p.schemeWeekId ?? '',
          });
          setPair(`${p.classId}:${p.subjectId ?? ''}`);
        }
      }
      if (mode === 'teacher') {
        const ctx = await fetchOne<{ currentTermId: string | null }>('/api/v1/timetable/context', toast.error);
        if (ctx?.currentTermId) {
          setAssignments(
            await fetchList<TeachingAssignment>(`/api/v1/lesson-prep/my-subjects?termId=${ctx.currentTermId}`, toast.error),
          );
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // The chosen (class, subject)'s scheme of work — to pick the week this
  // lesson covers.
  const [classId, subjectId] = pair.split(':');
  const schemeId = assignments.find((a) => a.classId === classId && a.subjectId === subjectId)?.scheme?.id;
  useEffect(() => {
    if (!schemeId) return;
    void (async () => {
      setScheme(await fetchOne<Scheme>(`/api/v1/lesson-prep/schemes/${schemeId}`, toast.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemeId]);

  // Only the chosen pair's scheme counts (a stale one from a previous pick doesn't).
  const activeScheme = scheme && scheme.id === schemeId ? scheme : null;
  const editable = mode === 'teacher' && (isNew || plan?.canEdit);
  const selfEvalEditable = mode === 'teacher' && !isNew && !!plan && !plan.canEdit;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function pickWeek(weekId: string) {
    const w = activeScheme?.weekList.find((x) => x.id === weekId);
    set({
      schemeWeekId: weekId,
      ...(w && !form.topic ? { topic: w.topic ?? '', subTopic: w.subTopic ?? '' } : {}),
      ...(w && !form.objectives && w.competences ? { objectives: w.competences } : {}),
      ...(w && !form.materials && w.materials ? { materials: w.materials } : {}),
    });
  }

  const body = () => ({
    classId,
    subjectId: subjectId || null,
    streamId: plan?.streamId ?? prefill?.streamId ?? null,
    timetableSlotId: plan?.timetableSlotId ?? prefill?.timetableSlotId ?? null,
    schemeWeekId: form.schemeWeekId || null,
    lessonDate: form.lessonDate,
    topic: form.topic.trim(),
    subTopic: form.subTopic || null,
    objectives: form.objectives || null,
    materials: form.materials || null,
    introduction: form.introduction || null,
    development: form.development || null,
    conclusion: form.conclusion || null,
    assessment: form.assessment || null,
    selfEvaluation: form.selfEvaluation || null,
  });

  async function save(andSubmit = false) {
    setSaving(true);
    const res = isNew
      ? await submitJson<LessonPlan>('/api/v1/lesson-prep/plans', 'POST', body())
      : await submitJson<LessonPlan>(`/api/v1/lesson-prep/plans/${planId}`, 'PUT', body());
    if (!res.ok || !res.data) {
      setSaving(false);
      toast.error(res.error!);
      return;
    }
    let saved = res.data;
    if (andSubmit) {
      const sub = await submitJson<LessonPlan>(`/api/v1/lesson-prep/plans/${saved.id}/submit`, 'POST');
      if (!sub.ok) toast.error(sub.error!);
      else saved = sub.data!;
    }
    setSaving(false);
    toast.success(andSubmit ? 'Lesson plan submitted for review.' : 'Lesson plan saved.');
    if (isNew) router.replace(`${backHref}/plans/${saved.id}`);
    else setPlan(saved);
  }

  async function remove() {
    if (!confirm('Delete this lesson plan?')) return;
    const res = await submitJson(`/api/v1/lesson-prep/plans/${planId}`, 'DELETE');
    if (res.ok) router.replace(backHref);
    else toast.error(res.error!);
  }

  async function review(decision: 'approve' | 'return', comment: string) {
    const res = await submitJson<LessonPlan>(`/api/v1/lesson-prep/plans/${planId}/review`, 'POST', {
      decision,
      comment: comment || null,
    });
    if (res.ok) {
      toast.success(decision === 'approve' ? 'Lesson plan approved.' : 'Returned to the teacher.');
      setPlan(res.data!);
    } else toast.error(res.error!);
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader size={44} />
      </div>
    );
  }
  if (!isNew && !plan) return <p className="text-sm text-text-muted">That lesson plan doesn&apos;t exist.</p>;

  const heading = plan
    ? `${plan.subjectName ?? 'Lesson'} · ${plan.className}${plan.streamName ? ` ${plan.streamName}` : ''}`
    : 'New lesson plan';

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href={backHref} className="text-sm text-primary-700 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-primary-900">{heading}</h1>
        {plan && (
          <p className="text-sm text-text-muted">
            {fmtDate(plan.lessonDate)}
            {mode === 'admin' ? ` · ${plan.teacherName}` : ''}
            {plan.schemeWeekNumber ? ` · Scheme week ${plan.schemeWeekNumber}` : ''}
          </p>
        )}
      </div>

      {plan && (
        <ReviewPanel
          status={plan.status}
          reviewComment={plan.reviewComment}
          reviewedByName={plan.reviewedByName}
          canReview={mode === 'admin'}
          onReview={review}
        />
      )}

      <Card className="space-y-3">
        {editable ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Class and subject"
                value={pair}
                onChange={(e) => {
                  set({ schemeWeekId: '' });
                  setPair(e.target.value);
                }}
                disabled={!!prefill?.timetableSlotId || !!plan?.timetableSlotId}
                options={[
                  { value: '', label: 'Choose…' },
                  ...assignments.map((a) => ({
                    value: `${a.classId}:${a.subjectId}`,
                    label: `${a.className} — ${a.subjectName}`,
                  })),
                ]}
              />
              <Input
                label="Lesson date"
                type="date"
                value={form.lessonDate}
                onChange={(e) => set({ lessonDate: e.target.value })}
              />
            </div>
            {activeScheme && (
              <Select
                label="Scheme of work week (fills in the topic)"
                value={form.schemeWeekId}
                onChange={(e) => pickWeek(e.target.value)}
                options={[
                  { value: '', label: 'Not linked to a week' },
                  ...activeScheme.weekList
                    .filter((w) => w.topic)
                    .map((w) => ({ value: w.id, label: `Week ${w.weekNumber}: ${w.topic}` })),
                ]}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Topic *" value={form.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={300} />
              <Input label="Sub-topic" value={form.subTopic} onChange={(e) => set({ subTopic: e.target.value })} maxLength={300} />
            </div>
            {SECTIONS.map((s) => (
              <label key={s.key} className="block">
                <span className="block text-xs font-medium text-text-muted mb-1">{s.label}</span>
                <textarea
                  rows={s.rows}
                  value={form[s.key]}
                  onChange={(e) => set({ [s.key]: e.target.value } as Partial<Form>)}
                  placeholder={s.hint}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                />
              </label>
            ))}
          </>
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-text-muted">Topic</dt>
              <dd className="font-semibold text-primary-900">
                {form.topic}
                {form.subTopic ? <span className="font-normal"> — {form.subTopic}</span> : null}
              </dd>
            </div>
            {SECTIONS.filter((s) => form[s.key]).map((s) => (
              <div key={s.key}>
                <dt className="text-xs text-text-muted">{s.label}</dt>
                <dd className="text-primary-900 whitespace-pre-line">{form[s.key]}</dd>
              </div>
            ))}
          </dl>
        )}

        {(editable || selfEvalEditable || form.selfEvaluation) && !isNew && (
          <label className="block pt-2 border-t border-border">
            <span className="block text-xs font-medium text-text-muted mb-1">
              Self-evaluation (after teaching) — what went well, what to change
            </span>
            {editable || selfEvalEditable ? (
              <textarea
                rows={3}
                value={form.selfEvaluation}
                onChange={(e) => set({ selfEvaluation: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <p className="text-sm text-primary-900 whitespace-pre-line">{form.selfEvaluation}</p>
            )}
          </label>
        )}

        {mode === 'teacher' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(editable || selfEvalEditable) && (
              <Button inline variant={editable ? 'outline' : 'primary'} onClick={() => void save()} isLoading={saving} disabled={!pair || !form.topic.trim()}>
                Save
              </Button>
            )}
            {editable && (
              <Button inline onClick={() => void save(true)} disabled={saving || !pair || !form.topic.trim()}>
                <Send className="w-4 h-4 mr-1.5" aria-hidden />
                Submit for review
              </Button>
            )}
            {!isNew && plan?.canEdit && (
              <Button inline variant="ghost" onClick={() => void remove()}>
                <Trash2 className="w-4 h-4 mr-1.5" aria-hidden />
                Delete
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
