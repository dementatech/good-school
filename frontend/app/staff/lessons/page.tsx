'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpenCheck, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  fmtDate,
  type LessonPlan,
  type Scheme,
  type TeachingAssignment,
} from '@/components/lesson-prep/types';
import { DAY_NAMES, type Period, type Slot, type TermContext } from '@/components/timetable/types';

type Tab = 'week' | 'schemes' | 'plans';

const eat = () => new Date(Date.now() + 3 * 3600_000);
function thisWeekDates(): Record<number, string> {
  const d = eat();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const out: Record<number, string> = {};
  for (let i = 1; i <= 6; i++) {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i - 1);
    out[i] = x.toISOString().slice(0, 10);
  }
  return out;
}

/** A teacher's lesson preparation: this week's lessons to plan, their schemes
 * of work (one per subject per class), and their lesson plans. */
export default function StaffLessonsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('week');
  const [context, setContext] = useState<TermContext | null>(null);
  const [assignments, setAssignments] = useState<TeachingAssignment[] | null>(null);
  const [plans, setPlans] = useState<LessonPlan[] | null>(null);
  const [timetable, setTimetable] = useState<{ periodsBySection: Record<string, Period[]>; slots: Slot[] } | null>(null);
  const [starting, setStarting] = useState('');

  const termId = context?.currentTermId ?? '';
  const dates = useMemo(() => thisWeekDates(), []);

  useEffect(() => {
    void (async () => {
      const ctx = await fetchOne<TermContext>('/api/v1/timetable/context', toast.error);
      setContext(ctx);
      const tid = ctx?.currentTermId;
      const [a, p, t] = await Promise.all([
        tid ? fetchList<TeachingAssignment>(`/api/v1/lesson-prep/my-subjects?termId=${tid}`, toast.error) : [],
        fetchList<LessonPlan>('/api/v1/lesson-prep/plans', toast.error),
        tid ? fetchOne<{ periodsBySection: Record<string, Period[]>; slots: Slot[] }>(`/api/v1/timetable/me?termId=${tid}`, toast.error) : null,
      ]);
      setAssignments(a);
      setPlans(p);
      setTimetable(t);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScheme(a: TeachingAssignment) {
    setStarting(`${a.classId}:${a.subjectId}`);
    const res = await submitJson<Scheme>('/api/v1/lesson-prep/schemes', 'POST', {
      termId,
      classId: a.classId,
      subjectId: a.subjectId,
    });
    setStarting('');
    if (res.ok && res.data) router.push(`/staff/lessons/schemes/${res.data.id}`);
    else toast.error(res.error!);
  }

  const periodById = useMemo(() => {
    const m = new Map<string, Period>();
    for (const ps of Object.values(timetable?.periodsBySection ?? {})) ps.forEach((p) => m.set(p.id, p));
    return m;
  }, [timetable]);

  const weekLessons = useMemo(
    () =>
      (timetable?.slots ?? [])
        .map((s) => ({ slot: s, date: dates[s.dayOfWeek], period: periodById.get(s.periodId) }))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.period?.startTime ?? '').localeCompare(b.period?.startTime ?? '')),
    [timetable, dates, periodById],
  );
  const planFor = (slotId: string, date: string) =>
    plans?.find((p) => p.timetableSlotId === slotId && p.lessonDate === date) ?? null;

  const loading = !context || !assignments || !plans;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6 text-primary-700" aria-hidden />
            Lesson Preparation
          </h1>
          <p className="text-sm text-text-muted max-w-2xl">
            Your schemes of work, lesson plans and records of work. Submit them for the Director of Studies to review.
          </p>
        </div>
        <Link href="/staff/lessons/plans/new">
          <Button inline>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden />
            New lesson plan
          </Button>
        </Link>
      </div>

      <Tabs
        tabs={[
          { key: 'week', label: 'This week' },
          { key: 'schemes', label: 'Schemes of work', count: assignments?.length },
          { key: 'plans', label: 'Lesson plans', count: plans?.length },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader size={44} />
        </div>
      ) : tab === 'week' ? (
        weekLessons.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">No timetabled lessons this week.</p>
          </Card>
        ) : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
                  <th className="py-2.5 px-4">When</th>
                  <th className="py-2.5 px-2">Class</th>
                  <th className="py-2.5 px-2">Lesson</th>
                  <th className="py-2.5 px-4 text-right">Plan</th>
                </tr>
              </thead>
              <tbody>
                {weekLessons.map(({ slot, date, period }) => {
                  const plan = planFor(slot.id, date);
                  const qs = new URLSearchParams({
                    slot: slot.id,
                    date,
                    classId: slot.classId,
                    ...(slot.subjectId ? { subjectId: slot.subjectId } : {}),
                    ...(slot.streamId ? { streamId: slot.streamId } : {}),
                  });
                  return (
                    <tr key={`${slot.id}-${date}`} className="border-b border-border last:border-0">
                      <td className="py-2 px-4">
                        <span className="block font-medium text-primary-900">{DAY_NAMES[slot.dayOfWeek]}</span>
                        <span className="block text-xs text-text-faint">
                          {period ? `${period.label} · ${period.startTime}` : ''}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        {slot.className}
                        {slot.streamName ? ` ${slot.streamName}` : ''}
                      </td>
                      <td className="py-2 px-2">{slot.subjectName ?? slot.activity}</td>
                      <td className="py-2 px-4 text-right">
                        {plan ? (
                          <Link href={`/staff/lessons/plans/${plan.id}`} className="inline-flex items-center gap-2">
                            <Badge variant={STATUS_VARIANT[plan.status]}>{STATUS_LABEL[plan.status]}</Badge>
                          </Link>
                        ) : slot.subjectId ? (
                          <Link
                            href={`/staff/lessons/plans/new?${qs.toString()}`}
                            className="text-xs font-medium text-primary-700 hover:underline"
                          >
                            Plan this lesson
                          </Link>
                        ) : (
                          <span className="text-text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      ) : tab === 'schemes' ? (
        assignments!.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">You haven&apos;t been assigned any subjects to teach this year.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assignments!.map((a) => (
              <Card key={`${a.classId}:${a.subjectId}`} className="flex flex-col gap-2">
                <div>
                  <p className="font-semibold text-primary-900">{a.subjectName}</p>
                  <p className="text-xs text-text-faint">{a.className}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {a.scheme ? (
                    <>
                      <Badge variant={STATUS_VARIANT[a.scheme.status]}>{STATUS_LABEL[a.scheme.status]}</Badge>
                      <Link
                        href={`/staff/lessons/schemes/${a.scheme.id}`}
                        className="text-xs font-medium text-primary-700 hover:underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-warning">Not started</span>
                      <Button
                        inline
                        variant="outline"
                        onClick={() => void startScheme(a)}
                        isLoading={starting === `${a.classId}:${a.subjectId}`}
                        disabled={!termId}
                      >
                        Start scheme
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : plans!.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">No lesson plans yet.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-2">Class</th>
                <th className="py-2.5 px-2">Topic</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans!.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/staff/lessons/plans/${p.id}`)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-bg-subtle"
                >
                  <td className="py-2 px-4 whitespace-nowrap">{fmtDate(p.lessonDate)}</td>
                  <td className="py-2 px-2">
                    {p.className} · {p.subjectName}
                  </td>
                  <td className="py-2 px-2">{p.topic}</td>
                  <td className="py-2 px-4 text-right">
                    <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
