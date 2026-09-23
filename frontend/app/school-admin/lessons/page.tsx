'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpenCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  fmtDate,
  type LessonPlan,
  type SchemeSummary,
} from '@/components/lesson-prep/types';
import type { TermContext } from '@/components/timetable/types';

type Tab = 'review' | 'teachers' | 'schemes' | 'plans';

interface TeacherCompliance {
  teacherId: string;
  teacherName: string;
  subjectsToPlan: number;
  schemesApproved: number;
  schemesSubmitted: number;
  schemesInProgress: number;
  lessonsPerWeek: number;
  plansThisWeek: number;
  weeksRecorded: number;
  weeksDue: number;
}

/** The DOS's view: what's waiting for review, and which teachers are up to
 * date with schemes of work, lesson plans and records of work. */
export default function SchoolAdminLessonsPage() {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('review');
  const [context, setContext] = useState<TermContext | null>(null);
  const [termId, setTermId] = useState('');
  const [schemes, setSchemes] = useState<SchemeSummary[] | null>(null);
  const [plans, setPlans] = useState<LessonPlan[] | null>(null);
  const [compliance, setCompliance] = useState<{ currentWeek: number; teachers: TeacherCompliance[] } | null>(null);

  useEffect(() => {
    void (async () => {
      const ctx = await fetchOne<TermContext>('/api/v1/timetable/context', toast.error);
      setContext(ctx);
      setTermId(ctx?.currentTermId ?? ctx?.terms[0]?.id ?? '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!termId) return;
    void (async () => {
      const term = context?.terms.find((t) => t.id === termId);
      const [s, p, c] = await Promise.all([
        fetchList<SchemeSummary>(`/api/v1/lesson-prep/schemes?termId=${termId}`, toast.error),
        fetchList<LessonPlan>(
          `/api/v1/lesson-prep/plans?from=${term?.startDate ?? ''}&to=${term?.endDate ?? ''}`,
          toast.error,
        ),
        fetchOne<{ currentWeek: number; teachers: TeacherCompliance[] }>(
          `/api/v1/lesson-prep/compliance?termId=${termId}`,
          toast.error,
        ),
      ]);
      setSchemes(s);
      setPlans(p);
      setCompliance(c);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const pendingSchemes = schemes?.filter((s) => s.status === 'submitted') ?? [];
  const pendingPlans = plans?.filter((p) => p.status === 'submitted') ?? [];
  const loading = !schemes || !plans || !compliance;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6 text-primary-700" aria-hidden />
            Lesson Preparation
          </h1>
          <p className="text-sm text-text-muted max-w-2xl">
            Review teachers&apos; schemes of work and lesson plans, check their records of work, and see who is up to
            date.
          </p>
        </div>
        {(context?.terms.length ?? 0) > 0 && (
          <div className="w-40">
            <Select
              label="Term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              options={context!.terms.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'review', label: 'Awaiting review', count: pendingSchemes.length + pendingPlans.length },
          { key: 'teachers', label: 'Teachers' },
          { key: 'schemes', label: 'Schemes of work', count: schemes?.length },
          { key: 'plans', label: 'Lesson plans', count: plans?.length },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader size={44} />
        </div>
      ) : tab === 'review' ? (
        pendingSchemes.length + pendingPlans.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">Nothing is waiting for review.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingSchemes.length > 0 && (
              <SchemeTable title="Schemes of work" rows={pendingSchemes} onOpen={(id) => router.push(`/school-admin/lessons/schemes/${id}`)} />
            )}
            {pendingPlans.length > 0 && (
              <PlanTable title="Lesson plans" rows={pendingPlans} onOpen={(id) => router.push(`/school-admin/lessons/plans/${id}`)} />
            )}
          </div>
        )
      ) : tab === 'teachers' ? (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
                <th className="py-2.5 px-4">Teacher</th>
                <th className="py-2.5 px-3">Schemes of work</th>
                <th className="py-2.5 px-3">Plans this week</th>
                <th className="py-2.5 px-4">Records of work (week {compliance!.currentWeek})</th>
              </tr>
            </thead>
            <tbody>
              {compliance!.teachers.map((t) => {
                const behindSchemes = t.schemesApproved < t.subjectsToPlan;
                const behindPlans = t.plansThisWeek < t.lessonsPerWeek;
                const behindRecords = t.weeksRecorded < t.weeksDue;
                return (
                  <tr key={t.teacherId} className="border-b border-border last:border-0">
                    <td className="py-2.5 px-4 font-medium text-primary-900">{t.teacherName}</td>
                    <td className="py-2.5 px-3">
                      <span className={behindSchemes ? 'text-warning font-semibold' : 'text-success font-semibold'}>
                        {t.schemesApproved}/{t.subjectsToPlan} approved
                      </span>
                      {(t.schemesSubmitted > 0 || t.schemesInProgress > 0) && (
                        <span className="block text-xs text-text-faint">
                          {t.schemesSubmitted} awaiting review · {t.schemesInProgress} in progress
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={behindPlans ? 'text-warning font-semibold' : 'text-success font-semibold'}>
                        {t.plansThisWeek}/{t.lessonsPerWeek}
                      </span>
                      <span className="block text-xs text-text-faint">timetabled lessons</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={behindRecords ? 'text-warning font-semibold' : 'text-success font-semibold'}>
                        {t.weeksRecorded}/{t.weeksDue}
                      </span>
                      <span className="block text-xs text-text-faint">weeks recorded across their subjects</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : tab === 'schemes' ? (
        <SchemeTable rows={schemes!} onOpen={(id) => router.push(`/school-admin/lessons/schemes/${id}`)} />
      ) : (
        <PlanTable rows={plans!} onOpen={(id) => router.push(`/school-admin/lessons/plans/${id}`)} />
      )}
    </div>
  );
}

function SchemeTable({ title, rows, onOpen }: { title?: string; rows: SchemeSummary[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">No schemes of work yet this term.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {title && <h2 className="text-sm font-bold text-primary-900">{title}</h2>}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
              <th className="py-2.5 px-4">Subject</th>
              <th className="py-2.5 px-2">Teacher</th>
              <th className="py-2.5 px-2">Planned</th>
              <th className="py-2.5 px-2">Recorded</th>
              <th className="py-2.5 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} onClick={() => onOpen(s.id)} className="border-b border-border last:border-0 cursor-pointer hover:bg-bg-subtle">
                <td className="py-2 px-4">
                  <span className="font-medium text-primary-900">{s.subjectName}</span>
                  <span className="text-text-muted"> · {s.className}</span>
                </td>
                <td className="py-2 px-2">{s.teacherName}</td>
                <td className="py-2 px-2 tabular-nums">
                  {s.weeksPlanned}/{s.weeks} weeks
                </td>
                <td className="py-2 px-2 tabular-nums">{s.weeksRecorded} weeks</td>
                <td className="py-2 px-4 text-right">
                  <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PlanTable({ title, rows, onOpen }: { title?: string; rows: LessonPlan[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">No lesson plans yet this term.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {title && <h2 className="text-sm font-bold text-primary-900">{title}</h2>}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-2">Lesson</th>
              <th className="py-2.5 px-2">Teacher</th>
              <th className="py-2.5 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="border-b border-border last:border-0 cursor-pointer hover:bg-bg-subtle">
                <td className="py-2 px-4 whitespace-nowrap">{fmtDate(p.lessonDate)}</td>
                <td className="py-2 px-2">
                  <span className="font-medium text-primary-900">{p.topic}</span>
                  <span className="block text-xs text-text-faint">
                    {p.className} · {p.subjectName}
                  </span>
                </td>
                <td className="py-2 px-2">{p.teacherName}</td>
                <td className="py-2 px-4 text-right">
                  <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
