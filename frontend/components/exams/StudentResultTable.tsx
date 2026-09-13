'use client';

import { Badge } from '@/components/ui/Badge';
import type { StudentExamResult } from './publishedResults';

const fmt = (d: string) => new Date(d).toLocaleDateString();

/**
 * Report-card-style breakdown for one published exam, shared by the student
 * and parent "view result" pages — same underlying exam_result/grade_band
 * data, just scoped to whichever student the caller resolved.
 */
export function StudentResultTable({ result }: { result: StudentExamResult }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary-900">{result.exam.name}</h1>
        <p className="text-sm text-text-muted">
          {result.exam.termName} · {fmt(result.exam.startsOn)}–{fmt(result.exam.endsOn)} · Published{' '}
          {fmt(result.exam.publishedAt)}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted bg-bg-subtle border-b border-border">
              <th className="py-2.5 px-4">Subject</th>
              <th className="py-2.5 px-2 w-24">Score</th>
              <th className="py-2.5 px-2 w-20">Grade</th>
              <th className="py-2.5 px-4">Comment</th>
            </tr>
          </thead>
          <tbody>
            {result.subjects.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-text-muted">
                  No subjects on this result.
                </td>
              </tr>
            )}
            {result.subjects.map((s) => (
              <tr key={s.subjectId} className="border-b border-border/60 last:border-0">
                <td className="py-2 px-4">
                  <span className="font-medium text-primary-900">{s.subjectName}</span>
                  {s.hasVariant && s.variantScores && (
                    <p className="text-xs text-text-faint mt-0.5">
                      {s.variantScores
                        .map((v) => `${v.name} ${v.isAbsent ? 'Absent' : (v.rawScore ?? '—')}`)
                        .join(' + ')}
                    </p>
                  )}
                </td>
                <td className="py-2 px-2 font-medium text-primary-900 tabular-nums">
                  {s.isAbsent ? (
                    <span className="text-text-muted font-normal">Absent</span>
                  ) : s.rawScore === null ? (
                    <span className="text-text-faint font-normal">—</span>
                  ) : (
                    s.rawScore
                  )}
                </td>
                <td className="py-2 px-2">
                  {s.computedGrade ? (
                    <Badge variant="accent">{s.computedGrade}</Badge>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                <td className="py-2 px-4 text-text-muted">{s.comment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
