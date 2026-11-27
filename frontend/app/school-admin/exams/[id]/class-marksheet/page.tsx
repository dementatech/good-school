'use client';

import { Fragment, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchList, fetchOne } from '@/lib/api/envelope';
import { usePortalBase } from '@/lib/portal';
import {
  bandsFrom,
  type ExamReportCard,
  type GradeBand,
  type ReportCardStudent,
  type ReportCardStudentSubject,
  type SchoolGradingSchemeSelection,
} from '@/components/admin/report-cards/ReportCardSheet';
import { SortHeader, useTableSort } from '@/components/ui/SortHeader';
import { byCoreThenName } from '@/lib/subjects/order';

/** One printable sheet for a class: learners down the side, subjects across the
 *  top. With `blank=1` the cells are empty, for marking by hand. */
function ClassMarkSheetContent() {
  const { id: examId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const base = usePortalBase();
  const toast = useToast();
  const { user } = useAuth();

  const classId = search.get('classId');
  const streamId = search.get('streamId');
  const blank = search.get('blank') === '1';
  const [subjectId, setSubjectId] = useState('');
  const [report, setReport] = useState<ExamReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradingSchemes, setGradingSchemes] = useState<SchoolGradingSchemeSelection[]>([]);

  useEffect(() => {
    if (!classId) return;
    void (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ classId });
      if (streamId) qs.set('streamId', streamId);
      const [card, schemes] = await Promise.all([
        fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error),
        fetchList<SchoolGradingSchemeSelection>('/api/v1/academic/school-grading-schemes', toast.error),
      ]);
      setReport(card);
      setGradingSchemes(schemes);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, classId, streamId]);

  // Core subjects first, optionals last (the backend already sends them in
  // this order; sorting here keeps it so for any older response).
  const orderedSubjects = useMemo(
    () =>
      // A-Level without the backend's flag: principals before subsidiaries.
      [...(report?.classSubjects ?? [])]
        .map((s) => ({ ...s, isCore: s.isCore ?? (report?.class.phase === 'A_LEVEL' ? s.role === 'principal' : undefined) }))
        .sort(byCoreThenName),
    [report],
  );
  const subjects = useMemo(
    () => orderedSubjects.filter((subject) => !subjectId || subject.subjectId === subjectId),
    [orderedSubjects, subjectId],
  );
  const showStream = !report?.stream && report?.students.some((student) => student.streamName);
  const isALevel = report?.class.phase === 'A_LEVEL';
  const isPrimary = report?.class.phase === 'PRIMARY';

  // A subject's grade: the one frozen at publish, else its band on the
  // school's scheme for this level (A-Level subsidiaries on their own scale).
  const bands = useMemo(() => bandsFrom(gradingSchemes), [gradingSchemes]);
  const bandsFor = (role: 'principal' | 'subsidiary'): GradeBand[] =>
    isALevel ? (role === 'subsidiary' ? bands.subsidiaryBands : bands.principalBands) : isPrimary ? bands.primaryBands : bands.oLevelBands;
  const gradeOf = (score: ReportCardStudentSubject | undefined, role: 'principal' | 'subsidiary'): string => {
    if (!score || score.isAbsent || score.rawScore === null) return '';
    if (score.computedGrade) return score.computedGrade;
    const pct = score.rawScore;
    return bandsFor(role).find((b) => pct >= b.minPct && pct <= b.maxPct)?.label ?? '';
  };

  // Grade summary page: per subject, how many learners got each grade. One
  // table per grading scale (A-Level principals and subsidiaries differ),
  // grades best first; any grade seen that isn't on the scale is added at the end.
  const gradeSummaries = (() => {
    if (!report || blank) return [];
    const groups: { title: string; role: 'principal' | 'subsidiary' }[] = isALevel
      ? [
          { title: 'Principal subjects', role: 'principal' },
          { title: 'Subsidiary subjects', role: 'subsidiary' },
        ]
      : [{ title: 'Subjects', role: 'principal' }];
    return groups.flatMap(({ title, role }) => {
      const groupSubjects = subjects.filter((s) => !isALevel || s.role === role);
      if (groupSubjects.length === 0) return [];
      const rows = groupSubjects.map((subject) => {
        const counts: Record<string, number> = {};
        let absent = 0;
        for (const student of report.students) {
          const score = student.subjects.find((x) => x.subjectId === subject.subjectId);
          if (score?.isAbsent) absent++;
          const grade = gradeOf(score, subject.role);
          if (grade) counts[grade] = (counts[grade] ?? 0) + 1;
        }
        return { subject, counts, absent, graded: Object.values(counts).reduce((a, b) => a + b, 0) };
      });
      const scale = [...bandsFor(role)].sort((a, b) => b.minPct - a.minPct).map((b) => b.label);
      const extra = [...new Set(rows.flatMap((r) => Object.keys(r.counts)))].filter((g) => !scale.includes(g)).sort();
      return [{ title, grades: [...scale, ...extra], rows }];
    });
  })();

  // Click a heading to sort by it. Subject columns sort by that subject's mark.
  const valueOf = (student: ReportCardStudent, key: string) => {
    if (key === 'name') return student.studentName;
    if (key === 'stream') return student.streamName;
    if (key === 'average') return isALevel ? student.principalAverage : student.average;
    if (key === 'aggregate') return student.aggregate;
    if (key === 'position') return student.rank;
    const score = student.subjects.find((s) => s.subjectId === key);
    return score && !score.isAbsent ? score.rawScore : null;
  };
  const { sorted: students, sort, toggle } = useTableSort(report?.students ?? [], valueOf, { key: 'name', direction: 'asc' });
  const sortable = (label: React.ReactNode, key: string, numeric = false) =>
    blank ? label : <SortHeader label={label} sortKey={key} sort={sort} onSort={toggle} numeric={numeric} />;

  function switchTo(nextBlank: boolean) {
    const params = new URLSearchParams(search.toString());
    if (nextBlank) params.set('blank', '1');
    else params.delete('blank');
    router.replace(`${base}/exams/${examId}/class-marksheet?${params.toString()}`);
  }

  const cell = 'border border-[#999] px-1.5 py-1';

  return (
    <div className="space-y-4">
      {/* Sideways on paper: a class has too many subjects for a portrait sheet. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link href={`${base}/report-card-studio`} className="text-sm text-primary-700 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to Report Card Studio
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Sheet type" className="inline-flex rounded-lg border border-border-strong bg-white p-0.5">
            {[
              { value: false, label: 'With marks' },
              { value: true, label: 'Blank' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={blank === option.value}
                onClick={() => switchTo(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  blank === option.value ? 'bg-primary-700 text-white' : 'text-text-secondary hover:bg-bg-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-9 rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-primary-900"
          >
            <option value="">All subjects</option>
            {orderedSubjects.map((subject) => (
              <option key={subject.subjectId} value={subject.subjectId}>
                {subject.subjectName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-3.5 text-sm font-semibold text-white hover:bg-primary-800 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden /> Print
          </button>
        </div>
      </div>

      {!classId && <p className="text-sm text-text-muted">Open this page from Report Card Studio and pick a class.</p>}
      {loading && classId && (
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      )}
      {!loading && classId && !report && <p className="text-sm text-text-muted">This mark sheet could not be loaded.</p>}
      {!loading && report && report.students.length === 0 && (
        <p className="text-sm text-text-muted">No learners are enrolled in this class for this exam.</p>
      )}

      {!loading && report && report.students.length > 0 && (
        <div className="bg-white border border-border p-4 print:border-0 print:p-0 overflow-x-auto print:overflow-visible">
          <SheetHeader
            school={user?.school ?? ''}
            logoUrl={user?.logoUrl ?? null}
            title={`${blank ? 'Blank mark sheet' : 'Class mark sheet'}: ${report.exam.name}, ${report.exam.termName.replace(/_/g, ' ')}`}
            detail={`${report.class.name}${report.stream ? ` ${report.stream.name}` : ''}${
              subjectId && subjects[0] ? `, ${subjects[0].subjectName}` : ''
            }${blank ? '' : ' (marks shown as percentages)'}`}
          />

          <table className="w-full border-collapse text-xs text-primary-900">
            <thead>
              <tr className="bg-primary-700 text-white uppercase text-left [print-color-adjust:exact]">
                <th className={`${cell} w-8 text-center`}>#</th>
                <th className={cell}>{sortable('Learner', 'name')}</th>
                {showStream && <th className={cell}>{sortable('Stream', 'stream')}</th>}
                {subjects.map((subject) => (
                  <Fragment key={subject.subjectId}>
                    <th className={`${cell} text-center`} title={subject.subjectName}>
                      {sortable(subjectId ? 'Mark' : subject.subjectShortName.toUpperCase(), subject.subjectId, true)}
                    </th>
                    {!blank && (
                      <th className={`${cell} text-center`} title={`${subject.subjectName} grade`}>
                        GRD
                      </th>
                    )}
                  </Fragment>
                ))}
                {blank && subjectId && <th className={`${cell} w-1/3`}>Remarks</th>}
                {!blank && <th className={`${cell} text-center`}>{sortable('Average', 'average', true)}</th>}
                {!blank && <th className={`${cell} text-center`}>Avg Grade</th>}
                {!blank && isPrimary && <th className={`${cell} text-center`}>{sortable('Aggregate', 'aggregate')}</th>}
                {!blank && report.showPositions && <th className={`${cell} text-center`}>{sortable('Position', 'position')}</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => {
                const average = isALevel ? student.principalAverage : student.average;
                return (
                  <tr key={student.studentUserId} className="break-inside-avoid">
                    <td className={`${cell} text-center tabular-nums`}>{index + 1}</td>
                    <td className={`${cell} whitespace-nowrap uppercase`}>{student.studentName}</td>
                    {showStream && <td className={cell}>{student.streamName ?? ''}</td>}
                    {subjects.map((subject) => {
                      const score = student.subjects.find((s) => s.subjectId === subject.subjectId);
                      return (
                        <Fragment key={subject.subjectId}>
                          <td className={`${cell} text-center tabular-nums h-6`}>
                            {blank ? '' : score?.isAbsent ? 'Abs' : score?.rawScore != null ? Math.round(score.rawScore) : ''}
                          </td>
                          {!blank && <td className={`${cell} text-center font-bold`}>{gradeOf(score, subject.role)}</td>}
                        </Fragment>
                      );
                    })}
                    {blank && subjectId && <td className={cell} />}
                    {!blank && (
                      <td className={`${cell} text-center tabular-nums font-semibold`}>
                        {average !== null ? Math.round(average) : ''}
                      </td>
                    )}
                    {!blank && (
                      <td className={`${cell} text-center font-bold`}>
                        {(isALevel ? student.principalGrade : student.overallGrade) ?? ''}
                      </td>
                    )}
                    {!blank && isPrimary && <td className={`${cell} text-center tabular-nums`}>{student.aggregate ?? ''}</td>}
                    {!blank && report.showPositions && <td className={`${cell} text-center tabular-nums`}>{student.rank ?? ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {gradeSummaries.length > 0 && (
            <div className="mt-8 break-before-page print:mt-0">
              <SheetHeader
                school={user?.school ?? ''}
                logoUrl={user?.logoUrl ?? null}
                title={`Grade summary: ${report.exam.name}, ${report.exam.termName.replace(/_/g, ' ')}`}
                detail={`${report.class.name}${report.stream ? ` ${report.stream.name}` : ''} (${report.students.length} learners)`}
              />
              {gradeSummaries.map((summary) => (
                <div key={summary.title} className="mb-6">
                  {isALevel && <p className="mb-1.5 text-xs font-bold uppercase text-primary-900">{summary.title}</p>}
                  <table className="w-full border-collapse text-xs text-primary-900">
                    <thead>
                      <tr className="bg-primary-700 text-white uppercase text-left [print-color-adjust:exact]">
                        <th className={`${cell} w-8 text-center`}>#</th>
                        <th className={cell}>Subject</th>
                        {summary.grades.map((g) => (
                          <th key={g} className={`${cell} text-center`}>
                            {g}
                          </th>
                        ))}
                        <th className={`${cell} text-center`}>Abs</th>
                        <th className={`${cell} text-center`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row, i) => (
                        <tr key={row.subject.subjectId} className="break-inside-avoid">
                          <td className={`${cell} text-center tabular-nums`}>{i + 1}</td>
                          <td className={`${cell} whitespace-nowrap font-bold`} title={row.subject.subjectName}>
                            {row.subject.subjectShortName.toUpperCase()}
                          </td>
                          {summary.grades.map((g) => (
                            <td key={g} className={`${cell} text-center tabular-nums`}>
                              {row.counts[g] ?? 0}
                            </td>
                          ))}
                          <td className={`${cell} text-center tabular-nums`}>{row.absent}</td>
                          <td className={`${cell} text-center tabular-nums font-bold`}>{row.graded}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {blank && (
            <p className="mt-6 text-xs text-text-secondary">
              Teacher: ______________________________ Signature: ________________ Date: ______________
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The sheet's heading, in Times New Roman like every document header:
 * school logo at both ends, the school's name large in capitals, then the
 * sheet's title, then the class line. */
function SheetHeader({ school, logoUrl, title, detail }: { school: string; logoUrl: string | null; title: string; detail: string }) {
  const logo = (
    <div className="w-16 h-16 shrink-0 flex items-center justify-center">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="max-w-full max-h-full object-contain" />
      )}
    </div>
  );
  return (
    <div
      className="mb-4 flex items-center gap-4 border-b-2 border-primary-900 pb-3"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      {logo}
      <div className="flex-1 text-center">
        <p className="text-2xl font-black uppercase tracking-wide text-primary-900 leading-tight">{school}</p>
        <p className="mt-1 text-base font-bold uppercase text-primary-900">{title}</p>
        <p className="mt-0.5 text-sm font-semibold text-primary-900">{detail}</p>
      </div>
      {logo}
    </div>
  );
}

export default function ClassMarkSheetPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 flex justify-center">
          <Loader size={44} />
        </div>
      }
    >
      <ClassMarkSheetContent />
    </Suspense>
  );
}
