'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePortalBase } from '@/lib/portal';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import type { SchoolLevel, SubjectPhase } from '@/lib/levels';

type SubjectRole = 'principal' | 'subsidiary';

interface ReportCardStudentSubject {
  subjectId: string;
  subjectName: string;
  role: SubjectRole;
  hasVariant: boolean;
  variantScores?: { name: string; rawScore: number | null; isAbsent: boolean }[];
  /** Percentage (0–100) — what grades and averages use. */
  rawScore: number | null;
  /** As entered, out of maxMark (e.g. 38 of 50); null for a multi-paper subject. */
  mark: number | null;
  maxMark: number;
  isAbsent: boolean;
  computedGrade: string | null;
  /** Primary: counts toward the PLE aggregate. */
  isExaminable: boolean;
  /** Primary: the band's points (D1 = 1 … F9 = 9). */
  points: number | null;
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
  aggregate: number | null;
  division: string | null;
  rank: number | null;
  subjects: ReportCardStudentSubject[];
}
interface GradeDivision {
  label: string;
  minAggregate: number;
  maxAggregate: number;
}
interface ExamReportCard {
  exam: { id: string; name: string; termId: string; termName: string; publishedAt: string | null };
  /** The school's choice, per section, whether report cards show positions. */
  showPositions: boolean;
  class: { id: string; name: string; phase: SchoolLevel };
  stream: { id: string; name: string } | null;
  aggregation: { subjectCount: number; divisions: GradeDivision[] } | null;
  students: ReportCardStudent[];
}
interface SchoolClass {
  id: string;
  stageName: string;
  stagePhase: SchoolLevel;
}
interface SchoolInfo {
  name: string;
  district: string | null;
  address: string | null;
  logoUrl: string | null;
  /** Per section — a report card prints its own section's EMIS number. */
  emisCodes?: Partial<Record<string, string>>;
  sectionSettings?: { section: string; assessmentStyle: string | null }[];
}

/** A Nursery pupil's progress ratings for the exam's term ("both" mode). */
interface NurseryRatings {
  areas: { id: string; name: string }[];
  ratings: Record<string, { rating: string | null; comment: string | null }>;
}
interface GradeBand {
  label: string;
  minPct: number;
  maxPct: number;
  points: number | null;
  comment: string;
}
interface SchoolGradingSchemeSelection {
  appliesTo: SubjectPhase;
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
  // PLE (D1–F9) — keyed by the grade's first letter via gradeChip() below.
};

function gradeChip(grade: string): string {
  return GRADE_CHIP[grade] ?? PLE_CHIP[grade[0]] ?? 'bg-bg-muted text-text-muted';
}
const PLE_CHIP: Record<string, string> = {
  D: 'bg-success-bg text-success',
  C: 'bg-primary-50 text-primary-700',
  P: 'bg-warning-bg text-warning',
  F: 'bg-error-bg text-error',
};

/** The grade to print: the one frozen at publish, else the live band. */
function gradeOf(s: ReportCardStudentSubject, bands: GradeBand[]): string | null {
  if (s.computedGrade) return s.computedGrade;
  if (s.isAbsent || s.rawScore === null) return null;
  return bands.find((b) => s.rawScore! >= b.minPct && s.rawScore! <= b.maxPct)?.label ?? null;
}

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
  aggregation: ExamReportCard['aggregation'];
  totalInClass: number;
  showPositions: boolean;
  nurseryRatings: NurseryRatings | null;
}

function ReportSubjectTable({
  title,
  subjects,
  bands = [],
  showPoints = false,
}: {
  title: string;
  subjects: ReportCardStudentSubject[];
  /** Live-grade fallback for an unpublished exam (Primary). */
  bands?: GradeBand[];
  showPoints?: boolean;
}) {
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
            {showPoints && <th className="py-1 px-2 border-b border-r border-border text-center">Points</th>}
            <th className="py-1 px-2 border-b border-border">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => {
            const grade = gradeOf(s, bands);
            return (
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
                    // Out of the subject's own full mark when it isn't 100.
                    s.mark !== null && s.maxMark !== 100 ? `${round(s.mark)}/${s.maxMark}` : round(s.rawScore)
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-1 px-2 border-r border-border text-center">
                  {grade ? (
                    <span
                      className={`inline-flex min-w-6 justify-center px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${gradeChip(
                        grade,
                      )}`}
                    >
                      {grade}
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                {showPoints && (
                  <td className="py-1 px-2 border-r border-border text-center tabular-nums font-semibold">
                    {s.points ?? '—'}
                  </td>
                )}
                <td className="py-1 px-2 text-text-faint">
                  {bands.find((b) => b.label === grade)?.comment ?? '\u00a0'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RATING_LABEL: Record<string, string> = {
  emerging: 'Emerging',
  developing: 'Developing',
  proficient: 'Proficient',
};

function NurseryRatingsTable({ data }: { data: NurseryRatings }) {
  if (data.areas.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-faint mb-1.5">Progress Ratings</p>
      <table className="w-full text-sm border border-border">
        <thead>
          <tr className="bg-bg-subtle text-left text-[10.5px] font-bold uppercase tracking-wide text-text-faint">
            <th className="py-1 px-2 border-b border-r border-border">Learning Area</th>
            <th className="py-1 px-2 border-b border-border w-32">Rating</th>
          </tr>
        </thead>
        <tbody>
          {data.areas.map((a) => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <td className="py-1 px-2 border-r border-border">{a.name}</td>
              <td className="py-1 px-2 font-semibold text-primary-900">
                {RATING_LABEL[data.ratings[a.id]?.rating ?? ''] ?? '—'}
              </td>
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

function GradingLegend({ bands, divisions }: { bands: GradeBand[]; divisions?: GradeDivision[] }) {
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
            {divisions && b.points !== null ? ` (${b.points} pt${b.points === 1 ? '' : 's'})` : ''}
          </p>
        ))}
      </div>
      {divisions && divisions.length > 0 && (
        <p className="mt-1 text-[9px] leading-tight text-text-secondary">
          <span className="font-semibold text-text-muted">Aggregates: </span>
          {divisions.map((d) => `${d.label} ${d.minAggregate}–${d.maxAggregate}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function StudentReportCardSheet({
  sheet,
  schoolInfo,
  primaryBands,
  nurseryBands,
  oLevelBands,
  principalBands,
  subsidiaryBands,
}: {
  sheet: Sheet;
  schoolInfo: SchoolInfo | null;
  primaryBands: GradeBand[];
  nurseryBands: GradeBand[];
  oLevelBands: GradeBand[];
  principalBands: GradeBand[];
  subsidiaryBands: GradeBand[];
}) {
  const { student, exam, klass, stream, aggregation, totalInClass, showPositions, nurseryRatings } = sheet;
  const isALevel = klass.phase === 'A_LEVEL';
  const isPrimary = klass.phase === 'PRIMARY';
  const pleSubjects = student.subjects.filter((s) => s.isExaminable);
  const otherSubjects = student.subjects.filter((s) => !s.isExaminable);
  const pleScored = pleSubjects.filter((s) => !s.isAbsent && s.rawScore !== null);
  const pleTotal = pleScored.reduce((sum, s) => sum + (s.mark ?? s.rawScore!), 0);
  const pleOutOf = pleSubjects.reduce((sum, s) => sum + (s.mark !== null ? s.maxMark : 100), 0);
  const isNursery = klass.phase === 'KINDERGARTEN';
  const principalSubjects = student.subjects.filter((s) => s.role === 'principal');
  const subsidiarySubjects = student.subjects.filter((s) => s.role === 'subsidiary');
  const schoolName = schoolInfo?.name ?? 'School';
  const subtitle = [schoolInfo?.address, schoolInfo?.district].filter(Boolean).join(', ');
  const emis = schoolInfo?.emisCodes?.[isPrimary ? 'PRIMARY' : klass.phase === 'KINDERGARTEN' ? 'KINDERGARTEN' : 'SECONDARY'];
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
              {emis && <p className="text-[10px] font-semibold text-text-muted tracking-wide">EMIS No. {emis}</p>}
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
              {showPositions && (
                <p className="flex items-baseline gap-2">
                  <span className="text-text-muted">Position:</span>
                  <span className="font-semibold text-primary-900 border-b border-dotted border-border-strong px-2 min-w-16 inline-block">
                    {student.rank ? `${student.rank} of ${totalInClass}` : '—'}
                  </span>
                </p>
              )}
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
          ) : isPrimary ? (
            <div className="space-y-2.5">
              <ReportSubjectTable
                title="Examinable Subjects (PLE)"
                subjects={pleSubjects}
                bands={primaryBands}
                showPoints
              />
              <ReportSubjectTable title="Other Subjects" subjects={otherSubjects} bands={primaryBands} />
              <StatRow
                items={[
                  { label: 'Total Marks', value: pleScored.length ? `${round(pleTotal)} / ${pleOutOf}` : '—' },
                  { label: 'Average', value: student.average !== null ? `${round(student.average)}%` : '—' },
                  { label: 'Aggregate', value: student.aggregate !== null ? String(student.aggregate) : '—' },
                  { label: 'Division', value: student.division ?? '—' },
                ]}
              />
              <RemarksBox lines={[{ label: 'Overall', text: student.overallComment }]} />
            </div>
          ) : (
            <div className="space-y-2.5">
              <ReportSubjectTable
                title="Subjects"
                subjects={student.subjects}
                bands={isNursery ? nurseryBands : []}
              />
              <StatRow
                items={[
                  { label: 'Average', value: student.average !== null ? `${round(student.average)}%` : '—' },
                  { label: 'Overall Grade', value: student.overallGrade ?? '—' },
                ]}
              />
              {nurseryRatings && <NurseryRatingsTable data={nurseryRatings} />}
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

          <GradingLegend
            bands={
              isALevel
                ? [...principalBands, ...subsidiaryBands]
                : isPrimary
                  ? primaryBands
                  : isNursery
                    ? nurseryBands
                    : oLevelBands
            }
            divisions={isPrimary ? aggregation?.divisions : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function ReportCardsContent() {
  const { id: examId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const base = usePortalBase();
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

      const [school, schemes] = await Promise.all([
        fetchOne<SchoolInfo>('/api/v1/schools/me', toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
      ]);
      setSchoolInfo(school);
      setGradingSchemes(schemes);
      const nurseryStyle =
        school?.sectionSettings?.find((x) => x.section === 'KINDERGARTEN')?.assessmentStyle ?? 'ratings';

      async function loadForClass(classId: string, streamId: string | null): Promise<Sheet[]> {
        const qs = new URLSearchParams({ classId });
        if (streamId) qs.set('streamId', streamId);
        const report = await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error);
        if (!report) return [];
        // "Both" mode: a Nursery report card also carries the term's progress ratings.
        let ratings: {
          learningAreas: { id: string; name: string }[];
          pupils: { studentUserId: string; ratings: NurseryRatings['ratings'] }[];
        } | null = null;
        if (report.class.phase === 'KINDERGARTEN' && nurseryStyle === 'both') {
          ratings = await fetchOne(
            `/api/v1/early-years/sheet?classId=${classId}&termId=${report.exam.termId}`,
            toast.error,
          );
        }
        const students = studentIdParam ? report.students.filter((s) => s.studentUserId === studentIdParam) : report.students;
        return students.map((student) => ({
          student,
          exam: report.exam,
          klass: report.class,
          stream: report.stream,
          aggregation: report.aggregation,
          totalInClass: report.students.length,
          showPositions: report.showPositions,
          nurseryRatings: ratings
            ? {
                areas: ratings.learningAreas,
                ratings: ratings.pupils.find((p) => p.studentUserId === student.studentUserId)?.ratings ?? {},
              }
            : null,
        }));
      }

      if (wholeSchool) {
        if (!yearIdParam) {
          setError('Missing academic year — go back and try again from Report Card Studio.');
          setLoading(false);
          return;
        }
        const classList = await fetchList<SchoolClass>(`/api/v1/academic/classes?academicYearId=${yearIdParam}`, toast.error);
        // A Nursery on progress ratings sits no exams — its report lives under Kindergarten Progress.
        const examined = classList.filter((c) => c.stagePhase !== 'KINDERGARTEN' || nurseryStyle !== 'ratings');
        const perClass = await Promise.all(examined.map((c) => loadForClass(c.id, null)));
        setSheets(perClass.flat());
      } else if (classIdParam) {
        setSheets(await loadForClass(classIdParam, streamIdParam));
      } else {
        setError('No class specified.');
      }
      setLoading(false);
    })();
  }, [examId, wholeSchool, yearIdParam, classIdParam, streamIdParam, studentIdParam]);

  const primaryBands = useMemo(
    () => gradingSchemes.find((g) => g.appliesTo === 'PRIMARY' && g.roleScope === 'any')?.scheme.bands ?? [],
    [gradingSchemes],
  );
  const nurseryBands = useMemo(
    () => gradingSchemes.find((g) => g.appliesTo === 'KINDERGARTEN' && g.roleScope === 'any')?.scheme.bands ?? [],
    [gradingSchemes],
  );
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
    if (!classIdParam) return `${base}/report-card-studio`;
    const p = new URLSearchParams({ classId: classIdParam });
    if (streamIdParam) p.set('stream', streamIdParam);
    return `${base}/report-card-studio?${p.toString()}`;
  }, [base, classIdParam, streamIdParam]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/exams/${examId}/report-cards/pdf?${search.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.message ?? `The PDF request failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'report-cards.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reach the server — check your connection and try again.");
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
        {!loading && sheets.length > 0 && base === '/dos' && (
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden /> Print
          </button>
        )}
        {/* The server-side PDF renders the admin portal's page, which the DOS's
            teacher login can't open — in the DOS portal, use the browser's Print. */}
        {!loading && sheets.length > 0 && base === '/school-admin' && (
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
            primaryBands={primaryBands}
            nurseryBands={nurseryBands}
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
