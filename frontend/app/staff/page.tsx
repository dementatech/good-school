'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardCheck, ClipboardList, NotebookPen } from 'lucide-react';
import { Badge } from '@/components/kit/badge';
import { Button } from '@/components/kit/button';
import { Progress } from '@/components/kit/progress';
import { ComingUpPanel } from '@/components/dashboard/ComingUpPanel';
import { DashboardColumns, DashboardPage } from '@/components/dashboard/DashboardPage';
import { MetricCard, MetricGrid } from '@/components/dashboard/MetricCard';
import { NoticeBanner } from '@/components/dashboard/NoticeBanner';
import { Panel } from '@/components/dashboard/Panel';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import {
  isoWeekday,
  lessonsOn,
  markSheetsOwed,
  registersNotTaken,
  type AssignedExam,
  type RegisterClass,
  type TimetablePeriod,
  type TimetableSlot,
  type TodayLesson,
} from '@/lib/dashboard/role-data';
import { formatShortDate } from '@/lib/school-admin/dashboard';

interface LessonPlan {
  status: string;
}

export default function StaffDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<TodayLesson[]>([]);
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [registers, setRegisters] = useState<RegisterClass[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);

  useEffect(() => {
    void (async () => {
      const [timetable, assigned, attendance, planRows] = await Promise.all([
        fetchOne<{ slots: TimetableSlot[]; periodsBySection: Record<string, TimetablePeriod[]> }>('/api/v1/timetable/me', toast.error),
        fetchList<AssignedExam>('/api/v1/exams/assigned', toast.error),
        fetchOne<{ classes: RegisterClass[] }>('/api/v1/attendance/classes', toast.error),
        fetchList<LessonPlan>('/api/v1/lesson-prep/plans', toast.error),
      ]);
      setLessons(timetable ? lessonsOn(isoWeekday(new Date()), timetable.slots, timetable.periodsBySection) : []);
      setExams(assigned);
      setRegisters(attendance?.classes ?? []);
      setPlans(planRows);
      setLoading(false);
    })();
    // Loads once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owed = markSheetsOwed(exams);
  const toTake = registersNotTaken(registers);
  const plansInProgress = plans.filter((plan) => plan.status === 'draft' || plan.status === 'returned').length;

  return (
    <DashboardPage>
      {!loading && toTake.length > 0 && (
        <NoticeBanner
          title="Class register"
          message={`Today's register for ${toTake.map((c) => c.className).join(', ')} hasn't been taken yet.`}
          href="/staff/attendance"
          actionLabel="Take register"
        />
      )}

      <MetricGrid>
        <MetricCard icon={CalendarDays} label="Lessons today" value={lessons.length} href="/staff/timetable" loading={loading} />
        <MetricCard icon={ClipboardCheck} label="Registers to take" value={toTake.length} href="/staff/attendance" loading={loading} />
        <MetricCard icon={ClipboardList} label="Mark sheets to submit" value={owed} href="/staff/exam-marks" loading={loading} />
        <MetricCard icon={NotebookPen} label="Lesson plans in progress" value={plansInProgress} href="/staff/lessons" loading={loading} />
      </MetricGrid>

      <DashboardColumns
        left={
          <>
            <Panel
              icon={CalendarDays}
              title="Today's lessons"
              description={new Date().toLocaleDateString('en-GB', { weekday: 'long' })}
              loading={loading}
              empty={lessons.length === 0 ? 'No lessons on your timetable today.' : undefined}
            >
              <ul className="divide-y divide-border">
                {lessons.map((lesson) => (
                  <li key={lesson.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-primary-900 truncate">{lesson.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {lesson.classLabel}
                        {lesson.room ? `, ${lesson.room}` : ''}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">{lesson.time}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
            <ComingUpPanel />
          </>
        }
        right={
          <Panel
            icon={ClipboardList}
            title="Exam marks"
            description="Mark sheets assigned to you"
            loading={loading}
            empty={exams.length === 0 ? 'No exams need marks from you right now.' : undefined}
            action={
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                <Link href="/staff/exam-marks">Enter marks</Link>
              </Button>
            }
          >
            <ul className="space-y-4">
              {exams.map((exam) => {
                const done = exam.slots.filter((slot) => slot.submitted).length;
                const percent = exam.slots.length ? Math.round((done / exam.slots.length) * 100) : 0;
                return (
                  <li key={exam.examId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-primary-900 truncate">{exam.examName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {exam.marksDueOn ? `Due ${formatShortDate(exam.marksDueOn)}` : exam.termName}
                        </span>
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {exam.marksEntryOpen ? 'Marks open' : 'Not open yet'}
                      </Badge>
                    </div>
                    <Progress value={percent} aria-label={`${exam.examName} mark sheets submitted`} className="h-1.5" />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {done} of {exam.slots.length} submitted
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        }
      />
    </DashboardPage>
  );
}
