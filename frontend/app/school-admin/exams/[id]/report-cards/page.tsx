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
interface SchoolInfo {
  name: string;
  district: string | null;
  address: string | null;
  logoUrl: string | null;
}
interface GradeBand {
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  comment: string;
}
interface SchoolGradingSchemeSelection {
  appliesTo: 'O_LEVEL' | 'A_LEVEL';
  roleScope: 'any' | 'principal' | 'subsidiary';
  scheme: { bands: GradeBand[] };
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

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
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
            <th className="py-1 px-2 border-b border-r border-border w-8 text-center">#</th>
            <th className="py-1 px-2 border-b border-r border-border">Subject</th>
            <th className="py-1 px-2 border-b border-r border-border text-right">Score</th>
            <th className="py-1 px-2 border-b border-r border-border text-center">Grade</th>
            <th className="py-1 px-2 border-b border-border">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={s.subjectId} className="border-b border-border last:border-0">
              <td className="py-1 px-2 border-r border-border text-center text-text-faint tabular-nums">{i + 1}</td>
              <td className="py-1 px-2 border-r border-border">
                {s.subjectName}
                {s.hasVariant && s.variantScores && (
                  <span className="block text-[10px] text-text-faint">
                    {s.variantScores
                      .map((v) => `${v.name} ${v.isAbsent ? 'Abs' : v.rawScore !== null ? round(v.rawScore) : '—'}`)
                      .join(' · ')}
                  </span>
                )}
              </td>
              <td className="py-1 px-2 border-r border-border text-right tabular-nums font-semibold">
                {s.isAbsent ? (
                  <span className="text-text-muted font-normal">Absent</span>
                ) : s.rawScore !== null ? (
                  round(s.rawScore)
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1 px-2 border-r border-border text-center">
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
              <td className="py-1 px-2 text-text-faint">&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatRow({ items }: { items: { label: string; value: string }[] }) {
  return (
    <table className="w-full border border-border text-sm">
      <thead>
        <tr className="bg-bg-subtle text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
          {items.map((it) => (
            <th key={it.label} className="py-1 px-2 border-b border-r border-border last:border-r-0 text-center">
              {it.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {items.map((it) => (
            <td
              key={it.label}
              className="py-1.5 px-2 border-r border-border last:border-r-0 text-center font-extrabold text-primary-900"
            >
              {it.value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function RemarksBox({ lines }: { lines: { label: string; text: string | null }[] }) {
  const content = lines.filter((l) => l.text);
  return (
    <div className="border border-border p-2 min-h-[2.5rem]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-faint mb-0.5">Remarks</p>
      {content.length === 0 ? (
        <p className="text-xs text-text-faint">—</p>
      ) : (
        content.map((l) => (
          <p key={l.label} className="text-xs text-text-secondary">
            <span className="font-semibold">{l.label}: </span>
            <span className="italic">&ldquo;{l.text}&rdquo;</span>
          </p>
        ))
      )}
    </div>
  );
}

function GradingLegend({ bands }: { bands: GradeBand[] }) {
  if (bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.minPct - a.minPct);
  return (
    <div className="mt-2 pt-1.5 border-t border-border">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0 text-[9px] leading-tight text-text-secondary">
        {sorted.map((b) => (
          <p key={b.label}>
            <span className="font-semibold text-text-muted">
              {round(b.minPct)}%–{round(b.maxPct)}%:
            </span>{' '}
            {b.label} Grade — {b.comment}
          </p>
        ))}
      </div>
    </div>
  );
}

function StudentReportCardSheet({
  sheet,
  schoolInfo,
  oLevelBands,
  principalBands,
  subsidiaryBands,
}: {
  sheet: Sheet;
  schoolInfo: SchoolInfo | null;
  oLevelBands: GradeBand[];
  principalBands: GradeBand[];
  subsidiaryBands: GradeBand[];
}) {
  const { student, exam, klass, stream, totalInClass } = sheet;
  const isALevel = klass.phase === 'A_LEVEL';
  const principalSubjects = student.subjects.filter((s) => s.role === 'principal');
  const subsidiarySubjects = student.subjects.filter((s) => s.role === 'subsidiary');
  const schoolName = schoolInfo?.name ?? 'School';
  const subtitle = [schoolInfo?.address, schoolInfo?.district].filter(Boolean).join(', ');
  const issuedOn = exam.publishedAt
    ? new Date(exam.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="report-sheet bg-white p-2 max-w-[800px] mx-auto">
      {/* Certificate-style double frame, matching the school's printed marksheet layout. */}
      <div className="border-4 border-primary-700 p-1">
        <div className="border border-primary-700 p-4">
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="w-12 h-12 rounded-full border-2 border-primary-700 flex items-center justify-center overflow-hidden shrink-0 bg-primary-50">
              {schoolInfo?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={schoolInfo.logoUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-primary-700 font-extrabold text-sm">{initialsOf(schoolName)}</span>
              )}
            </div>
            <div className="flex-1 text-center">
              <p className="text-xl font-extrabold text-primary-700 uppercase tracking-wide leading-tight">
                {schoolName}
              </p>
              {subtitle && (
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">{subtitle}</p>
              )}
              <p className="text-[11px] font-bold text-primary-700 uppercase tracking-wide mt-1">
                {exam.name} &middot; {exam.termName}
              </p>
              <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white bg-gradient-to-r from-accent-dark to-accent">
                Report Card
              </span>
            </div>
            <div className="w-12 h-14 border border-border shrink-0" aria-hidden />
          </div>

          <div className="space-y-1 text-sm mb-2.5 border-t border-b border-border py-1.5">
            <p className="flex items-baseline gap-2">
              <span className="text-text-muted shrink-0">Student Name:</span>
              <span className="flex-1 border-b border-dotted border-border-strong font-semibold text-primary-900 pb-0.5">
                {student.studentName}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Class:</span>
                <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                  {klass.name}
                  {(stream?.name ?? student.streamName) ? ` ${stream?.name ?? student.streamName}` : ''}
                </span>
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Student ID:</span>
                <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                  {student.systemId ?? '—'}
                </span>
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-text-muted">Position:</span>
                <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                  {student.rank ? `${student.rank} of ${totalInClass}` : '—'}
                </span>
              </p>
            </div>
          </div>

          {isALevel ? (
            <div className="space-y-2.5">
              <ReportSubjectTable title="Principal Subjects" subjects={principalSubjects} />
              <ReportSubjectTable title="Subsidiary Subjects" subjects={subsidiarySubjects} />
              <div className="grid grid-cols-2 gap-2.5">
                <StatRow
                  items={[
                    { label: 'Principal Avg', value: student.principalAverage !== null ? `${round(student.principalAverage)}%` : '—' },
                    { label: 'Principal Grade', value: student.principalGrade ?? '—' },
                  ]}
                />
                <StatRow
                  items={[
                    { label: 'Subsidiary Avg', value: student.subsidiaryAverage !== null ? `${round(student.subsidiaryAverage)}%` : '—' },
                    { label: 'Subsidiary Grade', value: student.subsidiaryGrade ?? '—' },
                  ]}
                />
              </div>
              <RemarksBox
                lines={[
                  { label: 'Principal', text: student.principalComment },
                  { label: 'Subsidiary', text: student.subsidiaryComment },
                ]}
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              <ReportSubjectTable title="Subjects" subjects={student.subjects} />
              <StatRow
                items={[
                  { label: 'Average', value: student.average !== null ? `${round(student.average)}%` : '—' },
                  { label: 'Overall Grade', value: student.overallGrade ?? '—' },
                ]}
              />
              <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-6 mt-4 text-xs text-text-muted text-center">
            <div>
              <div className="h-5 border-b border-border mb-1" />
              Class Teacher&apos;s Signature
            </div>
            <div>
              <div className="h-5 border-b border-border mb-1" />
              Parent/Guardian&apos;s Signature
            </div>
            <div>
              <div className="h-5 border-b border-border mb-1" />
              Head Teacher&apos;s Signature
            </div>
          </div>
          <p className="text-[10px] text-text-faint mt-2">Issued on {issuedOn}</p>

          <GradingLegend bands={isALevel ? [...principalBands, ...subsidiaryBands] : oLevelBands} />
        </div>
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
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [gradingSchemes, setGradingSchemes] = useState<SchoolGradingSchemeSelection[]>([]);
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
        const report = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error);
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

      const [school, schemes] = await Promise.all([
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
      ]);
      setSchoolInfo(school);
      setGradingSchemes(schemes);

      if (wholeSchool) {
        if (!yearIdParam) {
          setError('Missing academic year — go back and try again from Report Card Studio.');
          setLoading(false);
          return;
        }
        const classList = await fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearIdParam}`, toast.error);
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

  const oLevelBands = useMemo(
    () => gradingSchemes.find((g) => g.appliesTo === 'O_LEVEL' && g.roleScope === 'any')?.scheme.bands ?? [],
    [gradingSchemes],
  );
  const principalBands = useMemo(
    () => gradingSchemes.find((g) => g.appliesTo === 'A_LEVEL' && g.roleScope === 'principal')?.scheme.bands ?? [],
    [gradingSchemes],
  );
  const subsidiaryBands = useMemo(
    () => gradingSchemes.find((g) => g.appliesTo === 'A_LEVEL' && g.roleScope === 'subsidiary')?.scheme.bands ?? [],
    [gradingSchemes],
  );

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
            schoolInfo={schoolInfo ?? (user ? { name: user.school, district: null, address: null, logoUrl: user.logoUrl ?? null } : null)}
            oLevelBands={oLevelBands}
            principalBands={principalBands}
            subsidiaryBands={subsidiaryBands}
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
