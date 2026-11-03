/**
 * What a report card covers. Kept apart from the screens because a slip here
 * still prints a believable report card, just with the wrong marks on it.
 */

export type ReportType = 'single' | 'side_by_side' | 'combined_equal' | 'combined_custom';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  single: 'This exam only',
  side_by_side: 'This exam, with other exams beside it',
  combined_equal: 'Combined, equal shares',
  combined_custom: 'Combined, your own percentages',
};

export interface ExamOption {
  id: string;
  termId: string;
  startsOn: string;
}

export interface ReportSelection {
  type: ReportType;
  examId: string;
  otherExamIds: string[];
  /** Combined with your own percentages: examId -> share. */
  weights: Record<string, number>;
}

/** The exam to open on: the latest that has started, since the newest in the
 *  list is usually an upcoming exam with no marks yet. */
export function defaultExam<T extends ExamOption>(exams: T[], today: string): T | null {
  const started = exams.filter((exam) => exam.startsOn <= today);
  const pool = started.length > 0 ? started : exams;
  return [...pool].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ?? null;
}

/** The exams a report normally sits beside: others from the same term that have started. */
export function defaultOtherExams(exams: ExamOption[], examId: string, today: string): string[] {
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return [];
  return exams
    .filter((e) => e.id !== examId && e.termId === exam.termId && e.startsOn <= today)
    .map((e) => e.id);
}

/** Null when the choice is incomplete and the report should stay on one exam. */
export function reportQueryParams(selection: ReportSelection): Record<string, string> | null {
  const { type, examId, otherExamIds, weights } = selection;
  if (type === 'single') return {};
  if (otherExamIds.length === 0) return null;
  if (type === 'side_by_side') return { mode: 'side_by_side', examIds: otherExamIds.join(',') };

  const ids = [examId, ...otherExamIds];
  if (type === 'combined_equal') return { mode: 'combined', examIds: ids.join(',') };
  const shares = ids.map((id) => weights[id] ?? 0);
  if (shares.some((share) => !Number.isFinite(share) || share < 0)) return null;
  if (shares.reduce((a, b) => a + b, 0) <= 0) return null;
  return { mode: 'combined', examIds: ids.join(','), weights: shares.join(',') };
}
