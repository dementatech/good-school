'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Printer, Table2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList } from '@/lib/api/envelope';
import { ClassBarChart, type ClassBar } from '@/components/school-admin/dashboard/ClassBarChart';
import { PanelHeader } from '@/components/school-admin/dashboard/PanelHeader';

interface AcademicYear {
  id: string;
  yearName: string;
  isCurrent: boolean;
}
interface Term {
  id: string;
  academicYearId: string;
  name: string;
}
interface SchoolClass {
  id: string;
  stageName: string;
  hasStreams: boolean;
}
interface Stream {
  id: string;
  name: string;
}
interface ExamPerformance {
  examId: string;
  label: string;
  name: string;
  termName: string;
  roster: number;
  scored: number;
  average: number | null;
  passRate: number | null;
  subjects: { subjectId: string; subjectName: string; average: number | null }[];
}

const selectClass = 'h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900';

/** How one class did across exams, for any term of any school year. */
export default function ExamPerformancePage() {
  const toast = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [rows, setRows] = useState<ExamPerformance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await fetchList<AcademicYear>('/api/v1/academic/years', toast.error);
      setYears(list);
      setYearId((list.find((y) => y.isCurrent) ?? list[0])?.id ?? '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!yearId) return;
    void (async () => {
      const [termList, classList] = await Promise.all([
        fetchList<Term>(`/api/v1/academic/terms?academicYearId=${yearId}`, toast.error),
        fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearId}`, toast.error),
      ]);
      setTerms(termList.filter((t) => t.academicYearId === yearId));
      setClasses(classList);
      setTermId('');
      setStreamId('');
      setClassId(classList[0]?.id ?? '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const selectedClass = classes.find((c) => c.id === classId);

  useEffect(() => {
    void (async () => {
      setStreamId('');
      setStreams(
        classId && selectedClass?.hasStreams
          ? await fetchList<Stream>(`/api/v1/academic/streams?classId=${classId}`, toast.error)
          : [],
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, selectedClass?.hasStreams]);

  useEffect(() => {
    if (!yearId || !classId) return;
    let stale = false;
    void (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ classId, academicYearId: yearId });
      if (termId) qs.set('termId', termId);
      if (streamId) qs.set('streamId', streamId);
      const data = await fetchList<ExamPerformance>(`/api/v1/exams/class-performance?${qs.toString()}`, toast.error);
      if (stale) return;
      setRows(data);
      setLoading(false);
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, termId, classId, streamId]);

  const bars = useMemo<ClassBar[]>(
    () =>
      rows.map((row) => ({
        id: row.examId,
        label: row.label,
        name: row.name,
        value: row.average ?? 0,
        details: [
          { label: 'Average', value: row.average !== null ? `${row.average}%` : '—' },
          { label: 'Pass rate', value: row.passRate !== null ? `${row.passRate}%` : '—' },
        ],
      })),
    [rows],
  );

  const subjectRows = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of rows) for (const subject of row.subjects) names.set(subject.subjectId, subject.subjectName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const cell = 'py-2 px-3 border-b border-border';

  return (
    <div className="max-w-[1320px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight">Exam Performance</h1>
          <p className="text-sm text-text-muted mt-1">
            {selectedClass ? `${selectedClass.stageName}: ` : ''}averages and pass rates across exams, for any term.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <select aria-label="School year" value={yearId} onChange={(e) => setYearId(e.target.value)} className={selectClass}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.yearName}</option>
            ))}
          </select>
          <select aria-label="Term" value={termId} onChange={(e) => setTermId(e.target.value)} className={selectClass}>
            <option value="">All terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.stageName}</option>
            ))}
          </select>
          {streams.length > 0 && (
            <select aria-label="Stream" value={streamId} onChange={(e) => setStreamId(e.target.value)} className={selectClass}>
              <option value="">All streams</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden /> Print
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-text-muted">No marks have been entered for this class in this period.</p>
        </Card>
      ) : (
        <>
          <Card>
            <PanelHeader icon={BarChart3} title="Average mark by exam" subtitle="Oldest exam first" />
            <ClassBarChart bars={bars} scaleMax={100} ariaLabel="Average mark of each exam" />
          </Card>

          <Card className="p-0 overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm text-primary-900">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className={cell}>Exam</th>
                  <th className={cell}>Term</th>
                  <th className={`${cell} text-right`}>Learners with marks</th>
                  <th className={`${cell} text-right`}>Average</th>
                  <th className={`${cell} text-right`}>Pass rate (40% and above)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.examId}>
                    <td className={`${cell} font-medium`}>{row.name}</td>
                    <td className={cell}>{row.termName}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.scored} of {row.roster}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.average !== null ? `${row.average}%` : '—'}</td>
                    <td className={`${cell} text-right tabular-nums`}>{row.passRate !== null ? `${row.passRate}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto print:overflow-visible">
            <PanelHeader icon={Table2} title="Subject averages" subtitle="Average mark per subject in each exam" />
            <table className="w-full text-sm text-primary-900">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className={cell}>Subject</th>
                  {rows.map((row) => (
                    <th key={row.examId} className={`${cell} text-right whitespace-nowrap`} title={row.name}>{row.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectRows.map(([subjectId, subjectName]) => (
                  <tr key={subjectId}>
                    <td className={cell}>{subjectName}</td>
                    {rows.map((row) => {
                      const average = row.subjects.find((s) => s.subjectId === subjectId)?.average ?? null;
                      return (
                        <td key={row.examId} className={`${cell} text-right tabular-nums`}>
                          {average !== null ? `${average}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
