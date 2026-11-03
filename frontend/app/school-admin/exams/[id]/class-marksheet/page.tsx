'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader } from '@/components/ui/loader';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchOne } from '@/lib/api/envelope';
import { usePortalBase } from '@/lib/portal';
import type { ExamReportCard } from '@/components/admin/report-cards/ReportCardSheet';

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

  useEffect(() => {
    if (!classId) return;
    void (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ classId });
      if (streamId) qs.set('streamId', streamId);
      setReport(await fetchOne<ExamReportCard>(`/api/v1/exams/${examId}/report-card?${qs.toString()}`, toast.error));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, classId, streamId]);

  const subjects = useMemo(
    () => (report?.classSubjects ?? []).filter((subject) => !subjectId || subject.subjectId === subjectId),
    [report, subjectId],
  );
  const showStream = !report?.stream && report?.students.some((student) => student.streamName);
  const isALevel = report?.class.phase === 'A_LEVEL';
  const isPrimary = report?.class.phase === 'PRIMARY';

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
            {(report?.classSubjects ?? []).map((subject) => (
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
        <div className="bg-white rounded-card border border-border p-4 print:border-0 print:p-0 overflow-x-auto print:overflow-visible">
          <div className="mb-3 text-center">
            <p className="text-base font-bold text-primary-900">{user?.school}</p>
            <p className="text-sm font-semibold text-primary-900">
              {blank ? 'Blank mark sheet' : 'Class mark sheet'}: {report.exam.name}, {report.exam.termName}
            </p>
            <p className="text-sm text-text-secondary">
              {report.class.name}
              {report.stream ? ` ${report.stream.name}` : ''}
              {subjectId && subjects[0] ? `, ${subjects[0].subjectName}` : ''}
              {!blank && ' (marks shown as percentages)'}
            </p>
          </div>

          <table className="w-full border-collapse text-xs text-primary-900">
            <thead>
              <tr className="bg-bg-subtle print:bg-transparent text-left">
                <th className={`${cell} w-8 text-center`}>#</th>
                <th className={cell}>Learner</th>
                {showStream && <th className={cell}>Stream</th>}
                {subjects.map((subject) => (
                  <th key={subject.subjectId} className={`${cell} text-center`} title={subject.subjectName}>
                    {subjectId ? 'Mark' : subject.subjectShortName}
                  </th>
                ))}
                {blank && subjectId && <th className={`${cell} w-1/3`}>Remarks</th>}
                {!blank && <th className={`${cell} text-center`}>Average</th>}
                {!blank && isPrimary && <th className={`${cell} text-center`}>Aggregate</th>}
                {!blank && report.showPositions && <th className={`${cell} text-center`}>Position</th>}
              </tr>
            </thead>
            <tbody>
              {report.students.map((student, index) => {
                const average = isALevel ? student.principalAverage : student.average;
                return (
                  <tr key={student.studentUserId} className="break-inside-avoid">
                    <td className={`${cell} text-center tabular-nums`}>{index + 1}</td>
                    <td className={`${cell} whitespace-nowrap`}>{student.studentName}</td>
                    {showStream && <td className={cell}>{student.streamName ?? ''}</td>}
                    {subjects.map((subject) => {
                      const score = student.subjects.find((s) => s.subjectId === subject.subjectId);
                      return (
                        <td key={subject.subjectId} className={`${cell} text-center tabular-nums h-6`}>
                          {blank ? '' : score?.isAbsent ? 'Abs' : score?.rawScore != null ? Math.round(score.rawScore) : ''}
                        </td>
                      );
                    })}
                    {blank && subjectId && <td className={cell} />}
                    {!blank && (
                      <td className={`${cell} text-center tabular-nums font-semibold`}>
                        {average !== null ? Math.round(average) : ''}
                      </td>
                    )}
                    {!blank && isPrimary && <td className={`${cell} text-center tabular-nums`}>{student.aggregate ?? ''}</td>}
                    {!blank && report.showPositions && <td className={`${cell} text-center tabular-nums`}>{student.rank ?? ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

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
