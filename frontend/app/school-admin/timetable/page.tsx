'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne, submitJson } from '@/lib/api/envelope';
import { useSchoolSections } from '@/lib/levels';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { PeriodsEditor } from '@/components/timetable/PeriodsEditor';
import { SlotModal, type SubjectOption, type TeacherOption } from '@/components/timetable/SlotModal';
import type { ClassTimetable, Period, Slot, TermContext } from '@/components/timetable/types';

interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: string;
  hasStreams: boolean;
  academicYearId: string;
}
interface Stream {
  id: string;
  classId: string;
  name: string;
}
interface Offering {
  subjectId: string;
  subjectName: string;
  subjectPhase: string;
  isOffered: boolean;
}
interface StaffMember {
  userId: string;
  firstName: string;
  lastName: string;
  activeAssignment: unknown;
}
interface TeacherLoad {
  staffId: string;
  teacherName: string;
  lessonsPerWeek: number;
  classes: number;
}

type Tab = 'classes' | 'day' | 'teachers';

export default function SchoolAdminTimetablePage() {
  const toast = useToast();
  const { active: section } = useSchoolSections();
  const [tab, setTab] = useState<Tab>('classes');
  const [context, setContext] = useState<TermContext | null>(null);
  const [termId, setTermId] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [timetable, setTimetable] = useState<ClassTimetable | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [cell, setCell] = useState<{ day: number; period: Period; slot: Slot | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [ctx, staff] = await Promise.all([
        fetchOne<TermContext>('/api/v1/timetable/context', toast.error),
        fetchList<StaffMember>('/api/v1/staff', toast.error),
      ]);
      setContext(ctx);
      setTermId(ctx?.currentTermId ?? ctx?.terms[0]?.id ?? '');
      setTeachers(
        staff
          .filter((s) => s.activeAssignment)
          .map((s) => ({ userId: s.userId, name: `${s.firstName} ${s.lastName}` }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      if (ctx?.academicYear) {
        const [cls, str] = await Promise.all([
          fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${ctx.academicYear.id}`, toast.error),
          fetchList<Stream>('/api/v1/academic/streams', toast.error),
        ]);
        setClasses(cls);
        setStreams(str);
        setClassId(cls[0]?.id ?? '');
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const klass = classes.find((c) => c.id === classId) ?? null;
  const classStreams = useMemo(() => streams.filter((s) => s.classId === classId), [streams, classId]);

  const loadTimetable = useCallback(async () => {
    if (!termId || !classId) return;
    const qs = new URLSearchParams({ termId, classId });
    if (streamId) qs.set('streamId', streamId);
    setTimetable(await fetchOne<ClassTimetable>(`/api/v1/timetable/class?${qs.toString()}`, toast.error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, classId, streamId]);

  useEffect(() => {
    void (async () => {
      await loadTimetable();
    })();
  }, [loadTimetable]);

  // The subjects this class's level offers this year — what a lesson can be.
  useEffect(() => {
    if (!klass) return;
    void (async () => {
      const offerings = await fetchList<Offering>(
        `/api/v1/academic/subject-offerings?academicYearId=${klass.academicYearId}&phase=${klass.stagePhase}`,
        toast.error,
      );
      setSubjects(
        offerings
          .filter((o) => o.isOffered)
          .map((o) => ({ id: o.subjectId, name: o.subjectName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass?.id]);

  const terms = context?.terms ?? [];
  const otherTerms = terms.filter((t) => t.id !== termId);

  async function copyFrom(fromTermId: string) {
    const from = terms.find((t) => t.id === fromTermId)?.name;
    if (!confirm(`Fill empty cells in this term's timetables with ${from}'s lessons?`)) return;
    const res = await submitJson<{ copied: number }>('/api/v1/timetable/copy', 'POST', { fromTermId, toTermId: termId });
    if (res.ok) {
      toast.success(`Copied ${res.data?.copied ?? 0} lessons from ${from}.`);
      await loadTimetable();
    } else {
      toast.error(res.error!);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader size={56} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 mb-1 flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-primary-700" aria-hidden />
            Timetable
          </h1>
          <p className="text-sm text-text-muted max-w-2xl">
            Set the school day, then fill each class&apos;s week. Clashes are refused — a teacher can&apos;t be in two
            places, and a class can&apos;t have two lessons at once.
          </p>
        </div>
        {terms.length > 0 && (
          <div className="w-40">
            <Select
              label="Term"
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              options={terms.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'classes', label: 'Class timetables' },
          { key: 'day', label: 'School day' },
          { key: 'teachers', label: 'Teachers' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {!context?.academicYear ? (
        <Card>
          <p className="text-sm text-text-muted">Set a current academic year and its terms first.</p>
        </Card>
      ) : tab === 'day' ? (
        section && <PeriodsEditor section={section} onSaved={() => void loadTimetable()} />
      ) : tab === 'teachers' ? (
        <TeacherLoads termId={termId} />
      ) : classes.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">Open some classes first (Classes &amp; Streams).</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Select
                label="Class"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStreamId('');
                }}
                options={classes.map((c) => ({ value: c.id, label: c.stageName }))}
              />
            </div>
            {classStreams.length > 0 && (
              <div className="w-44">
                <Select
                  label="Stream"
                  value={streamId}
                  onChange={(e) => setStreamId(e.target.value)}
                  options={[
                    { value: '', label: 'Whole class' },
                    ...classStreams.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>
            )}
            {otherTerms.length > 0 && timetable && timetable.slots.length === 0 && (
              <div className="ml-auto flex flex-wrap gap-2">
                {otherTerms.map((t) => (
                  <Button key={t.id} inline variant="outline" onClick={() => void copyFrom(t.id)}>
                    <Copy className="w-4 h-4 mr-1.5" aria-hidden />
                    Copy from {t.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {timetable && timetable.periods.length === 0 ? (
            <Card>
              <p className="text-sm text-text-muted mb-3">Set up the school day first — its periods, breaks and lunch.</p>
              <Button inline onClick={() => setTab('day')}>
                Set up the school day
              </Button>
            </Card>
          ) : timetable ? (
            <>
              <TimetableGrid
                periods={timetable.periods}
                days={timetable.days}
                slots={timetable.slots}
                onCellClick={(day, period, slot) => setCell({ day, period, slot })}
              />
              <p className="text-xs text-text-faint">
                {timetable.slots.length} lesson{timetable.slots.length === 1 ? '' : 's'} a week
                {classStreams.length > 0 && !streamId ? ' · pick a stream to timetable it separately' : ''}.
              </p>
            </>
          ) : (
            <div className="py-10 flex justify-center">
              <Loader size={40} />
            </div>
          )}
        </>
      )}

      {cell && timetable && klass && (
        <SlotModal
          termId={termId}
          classId={classId}
          streamId={streamId || null}
          day={cell.day}
          period={cell.period}
          slot={
            // A stream view shows whole-class lessons too; editing one of those
            // edits the stream's own cell instead.
            cell.slot && (cell.slot.streamId ?? '') === streamId ? cell.slot : null
          }
          subjects={subjects}
          teachers={teachers}
          allowActivity={klass.stagePhase === 'KINDERGARTEN'}
          onClose={() => setCell(null)}
          onSaved={loadTimetable}
        />
      )}
    </div>
  );
}

function TeacherLoads({ termId }: { termId: string }) {
  const toast = useToast();
  const [loads, setLoads] = useState<TeacherLoad[] | null>(null);
  const [selected, setSelected] = useState<TeacherLoad | null>(null);
  const [teacherTt, setTeacherTt] = useState<{
    periodsBySection: Record<string, Period[]>;
    days: number[];
    slots: Slot[];
  } | null>(null);

  useEffect(() => {
    if (!termId) return;
    void (async () => {
      setLoads(await fetchList<TeacherLoad>(`/api/v1/timetable/loads?termId=${termId}`, toast.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  useEffect(() => {
    if (!selected) return;
    void (async () => {
      setTeacherTt(await fetchOne(`/api/v1/timetable/teacher/${selected.staffId}?termId=${termId}`, toast.error));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.staffId, termId]);

  if (!loads) {
    return (
      <div className="py-10 flex justify-center">
        <Loader size={40} />
      </div>
    );
  }
  if (loads.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-muted">No lessons have been timetabled this term yet.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-faint border-b border-border">
              <th className="py-2.5 px-4">Teacher</th>
              <th className="py-2.5 px-4 text-right">Lessons a week</th>
              <th className="py-2.5 px-4 text-right">Classes</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.staffId} className="border-b border-border last:border-0">
                <td className="py-2.5 px-4 font-medium text-primary-900">{l.teacherName}</td>
                <td className="py-2.5 px-4 text-right tabular-nums">{l.lessonsPerWeek}</td>
                <td className="py-2.5 px-4 text-right tabular-nums">{l.classes}</td>
                <td className="py-2.5 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => setSelected(l)}
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    View timetable
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {selected && teacherTt && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-primary-900">{selected.teacherName}&apos;s week</p>
          {Object.entries(teacherTt.periodsBySection).map(([sec, periods]) => (
            <TimetableGrid
              key={sec}
              periods={periods}
              days={teacherTt.days}
              slots={teacherTt.slots.filter((s) => periods.some((p) => p.id === s.periodId))}
              cellLabel="class"
            />
          ))}
        </div>
      )}
    </div>
  );
}
