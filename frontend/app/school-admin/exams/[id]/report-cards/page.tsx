'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { ArrowLeft, Download } from 'lucide-react';

type SubjectRole = 'principal' | 'subsidiary';

interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
  role: SubjectRole;
  hasVariant: boolean;
  variantScores?: { name: string; rawScore: number | null; isAbsent: boolean }[];
  rawScore: number | null;
  isAbsent: boolean;
  computedGrade: string | null;
}
interface ReportCardStudent {
  studentUserId: string;
  studentName: string;
  systemId: string | null;
  streamId: string | null;
  streamName: string | null;
  average: number | null;
  overallGrade: string | null;
  overallComment: string | null;
  principalAverage: number | null;
  principalGrade: string | null;
  principalComment: string | null;
  subsidiaryAverage: number | null;
  subsidiaryGrade: string | null;
  subsidiaryComment: string | null;
  rank: number | null;
  subjects: ReportCardStudentSubject[];
}
interface ExamReportCard {
  exam: { id: string; name: string; termName: string; publishedAt: string | null };
  class: { id: string; name: string; phase: 'O_LEVEL' | 'A_LEVEL' };
  stream: { id: string; name: string } | null;
  students: ReportCardStudent[];
}
interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: 'O_LEVEL' | 'A_LEVEL';
}

const GRADE_CHIP: Record<string, string> = {
  A: 'bg-success-bg text-success',
  B: 'bg-primary-50 text-primary-700',
  C: 'bg-accent-light text-accent-dark',
  D: 'bg-warning-bg text-warning',
  E: 'bg-warning-bg text-warning',
  F: 'bg-error-bg text-error',
  Pass: 'bg-success-bg text-success',
  Fail: 'bg-error-bg text-error',
};

function round(n: number): number {
  return Math.round(n);
}

interface Sheet {
  student: ReportCardStudent;
  exam: ExamReportCard['exam'];
  klass: ExamReportCard['class'];
  stream: ExamReportCard['stream'];
  totalInClass: number;
}

function ReportSubjectTable({ title, subjects }: { title: string; subjects: ReportCardStudentSubject[] }) {
  if (subjects.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">{title}</p>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-bg-subtle text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
            <th className="py-1.5 px-2 border-b border-border">Subject</th>
            <th className="py-1.5 px-2 border-b border-border text-right">Score</th>
            <th className="py-1.5 px-2 border-b border-border text-center">Grade</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.subjectId} className="border-b border-border last:border-0">
              <td className="py-1.5 px-2">
                {s.subjectName}
                {s.hasVariant && s.variantScores && (
                  <span className="block text-[10px] text-text-faint">
                    {s.variantScores
                      .map((v) => `${v.name} ${v.isAbsent ? 'Abs' : v.rawScore !== null ? round(v.rawScore) : '—'}`)
                      .join(' · ')}
                  </span>
                )}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                {s.isAbsent ? (
                  <span className="text-text-muted font-normal">Absent</span>
                ) : s.rawScore !== null ? (
                  round(s.rawScore)
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1.5 px-2 text-center">
                {s.computedGrade ? (
                  <span
                    className={`inline-flex min-w-6 justify-center px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                      GRADE_CHIP[s.computedGrade] ?? 'bg-bg-muted text-text-muted'
                    }`}
                  >
                    {s.computedGrade}
                  </span>
                ) : (
                  <span className="text-text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBox({
  label,
  average,
  grade,
  comment,
}: {
  label: string;
  average: number | null;
  grade: string | null;
  comment: string | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-text-muted">{label}</p>
        <p className="text-sm font-extrabold text-primary-900 whitespace-nowrap">
          {average !== null ? `${round(average)}%` : '—'}
          {grade && <span className="text-text-muted font-semibold ml-1.5">{grade}</span>}
        </p>
      </div>
      {comment && <p className="text-xs text-text-secondary italic mt-1.5">&ldquo;{comment}&rdquo;</p>}
    </div>
  );
}

function StudentReportCardSheet({ sheet, schoolName, logoUrl }: { sheet: Sheet; schoolName?: string; logoUrl?: string | null }) {
  const { student, exam, klass, stream, totalInClass } = sheet;
  const isALevel = klass.phase === 'A_LEVEL';
  const principalSubjects = student.subjects.filter((s) => s.role === 'principal');
  const subsidiarySubjects = student.subjects.filter((s) => s.role === 'subsidiary');

  return (
    <div className="report-sheet bg-white p-8 max-w-[800px] mx-auto">
      <div className="flex items-center justify-between border-b-2 border-primary-700 pb-4 mb-5">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-14 h-14 rounded-lg object-contain border border-border" />
          )}
          <div>
            <p className="text-lg font-extrabold text-primary-900">{schoolName ?? 'School'}</p>
            <p className="text-xs text-text-muted">Student Report Card</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-primary-900">{exam.name}</p>
          <p className="text-xs text-text-muted">{exam.termName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-5">
        <p>
          <span className="text-text-muted">Name: </span>
          <span className="font-semibold text-primary-900">{student.studentName}</span>
        </p>
        <p>
          <span className="text-text-muted">System ID: </span>
          <span className="font-semibold text-primary-900">{student.systemId ?? '—'}</span>
        </p>
        <p>
          <span className="text-text-muted">Class: </span>
          <span className="font-semibold text-primary-900">
            {klass.name}
            {(stream?.name ?? student.streamName) ? ` ${stream?.name ?? student.streamName}` : ''}
          </span>
        </p>
        <p>
          <span className="text-text-muted">Position: </span>
          <span className="font-semibold text-primary-900">{student.rank ? `${student.rank} of ${totalInClass}` : '—'}</span>
        </p>
      </div>

      {isALevel ? (
        <div className="space-y-4">
          <ReportSubjectTable title="Principal Subjects" subjects={principalSubjects} />
          <ReportSubjectTable title="Subsidiary Subjects" subjects={subsidiarySubjects} />
          <div className="grid grid-cols-2 gap-3">
            <SummaryBox
              label="Principal average"
              average={student.principalAverage}
              grade={student.principalGrade}
              comment={student.principalComment}
            />
            <SummaryBox
              label="Subsidiary average"
              average={student.subsidiaryAverage}
              grade={student.subsidiaryGrade}
              comment={student.subsidiaryComment}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ReportSubjectTable title="Subjects" subjects={student.subjects} />
          <SummaryBox label="Overall average" average={student.average} grade={student.overallGrade} comment={student.overallComment} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-8 mt-12 pt-1 text-xs text-text-muted">
        <div className="border-t border-border pt-1.5">Class Teacher&apos;s Signature</div>
        <div className="border-t border-border pt-1.5">Head Teacher&apos;s Signature</div>
      </div>
    </div>
  );
}

function ReportCardsContent() {
  const { id: examId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  const classIdParam = search.get('classId');
  const streamIdParam = search.get('streamId');
  const studentIdParam = search.get('studentId');
  const yearIdParam = search.get('yearId');
  const wholeSchool = search.get('all') === '1';

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Signals headless Chrome (backend report-card-pdf.ts) that this
  // client-rendered, fetch-driven page has actually finished loading —
  // without it, a PDF render could snapshot the page mid-fetch and come out
  // blank. Cleared on unmount so a stale "ready" flag can't leak.
  useEffect(() => {
    document.body.setAttribute('data-pdf-ready', loading ? 'false' : 'true');
    return () => {
      document.body.removeAttribute('data-pdf-ready');
    };
  }, [loading]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      async function loadForClass(classId: string, streamId: string | null): Promise<Sheet[]> {
        const qs = new URLSearchParams({ classId });
        if (streamId) qs.set('streamId', streamId);
        const report = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`);
        if (!report) return [];
        const students = studentIdParam ? report.students.filter((s) => s.studentUserId === studentIdParam) : report.students;
        return students.map((student) => ({
          student,
          exam: report.exam,
          klass: report.class,
          stream: report.stream,
          totalInClass: report.students.length,
        }));
      }

      if (wholeSchool) {
        if (!yearIdParam) {
          setError('Missing academic year — go back and try again from Report Card Studio.');
          setLoading(false);
          return;
        }
        const classList = await fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearIdParam}`);
        const perClass = await Promise.all(classList.map((c) => loadForClass(c.id, null)));
        setSheets(perClass.flat());
      } else if (classIdParam) {
        setSheets(await loadForClass(classIdParam, streamIdParam));
      } else {
        setError('No class specified.');
      }
      setLoading(false);
    })();
  }, [examId, wholeSchool, yearIdParam, classIdParam, streamIdParam, studentIdParam]);

  const backHref = useMemo(() => {
    if (!classIdParam) return '/school-admin/report-card-studio';
    const p = new URLSearchParams({ classId: classIdParam });
    if (streamIdParam) p.set('stream', streamIdParam);
    return `/school-admin/report-card-studio?${p.toString()}`;
  }, [classIdParam, streamIdParam]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/exams/${examId}/report-cards/pdf?${search.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report-cards.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen print:min-h-0 bg-bg-canvas print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg-card px-6 py-3">
        <Link href={backHref} className="text-sm text-primary-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to Report Card Studio
        </Link>
        {!loading && sheets.length > 0 && (
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden /> {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        )}
      </div>

      {loading && (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      )}

      {!loading && error && <p className="text-sm text-text-muted text-center py-16">{error}</p>}

      {!loading && !error && sheets.length === 0 && (
        <p className="text-sm text-text-muted text-center py-16">No students to generate report cards for.</p>
      )}

      {!loading &&
        !error &&
        sheets.map((sheet) => (
          <StudentReportCardSheet
            key={sheet.student.studentUserId}
            sheet={sheet}
            schoolName={user?.school}
            logoUrl={user?.logoUrl}
          />
        ))}
    </div>
  );
}

export default function ReportCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      }
    >
      <ReportCardsContent />
    </Suspense>
  );
}
