/**
 * What a report card covers. Kept apart from the screens because a slip here
 * still prints a believable report card, just with the wrong marks on it.
 */

export type ReportType = 'template' | 'single' | 'side_by_side' | 'combined_equal' | 'combined_custom';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  template: 'As the template sets',
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
  // No mode: the server applies the template's exam rule.
  if (type === 'template') return {};
  if (type === 'single') return { mode: 'single' };
  if (otherExamIds.length === 0) return null;
  if (type === 'side_by_side') return { mode: 'side_by_side', examIds: otherExamIds.join(',') };

  const ids = [examId, ...otherExamIds];
  if (type === 'combined_equal') return { mode: 'combined', examIds: ids.join(',') };
  const shares = ids.map((id) => weights[id] ?? 0);
  if (shares.some((share) => !Number.isFinite(share) || share < 0)) return null;
  if (shares.reduce((a, b) => a + b, 0) <= 0) return null;
  return { mode: 'combined', examIds: ids.join(','), weights: shares.join(',') };
}

export interface RuleExam extends ExamOption {
  examCode: string;
}

/**
 * The report-card query a template's exam rule makes for an opened exam —
 * the same choice the server makes when Report Card Studio leaves the report
 * type to the template (backend optionsFromExamRule). The designer uses it to
 * preview a real learner with a template that isn't saved yet.
 */
export function examRuleParams(
  rule: { mode: 'opened' | 'term' | 'codes'; codes: string[]; combine: boolean; weights: Record<string, number> },
  examId: string,
  exams: RuleExam[],
  today: string,
): Record<string, string> {
  const exam = exams.find((e) => e.id === examId);
  if (!exam || rule.mode === 'opened') return { mode: 'single' };
  const term = exams
    .filter((e) => e.termId === exam.termId && (e.id === examId || e.startsOn <= today))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const chosen = term.filter((e) => e.id === examId || rule.mode === 'term' || rule.codes.includes(e.examCode.toUpperCase()));
  const others = chosen.filter((e) => e.id !== examId);
  if (others.length === 0) return { mode: 'single' };
  if (!rule.combine) return { mode: 'side_by_side', examIds: others.map((e) => e.id).join(',') };
  const ordered = [exam, ...others];
  const weights = ordered.map((e) => rule.weights[e.examCode.toUpperCase()] ?? 1);
  if (weights.reduce((a, b) => a + b, 0) <= 0) return { mode: 'single' };
  return { mode: 'combined', examIds: ordered.map((e) => e.id).join(','), weights: weights.join(',') };
}
