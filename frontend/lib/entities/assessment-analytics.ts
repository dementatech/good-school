/**
 * Assessment-analytics shapes — the PURE half of the old TERECO entity.
 *
 * The Supabase aggregation queries moved to the backend; the frontend keeps
 * only the response types its charts render against.
 */

export interface QuestionStat {
  questionId: string;
  code: string;
  questionText: string;
  maxScore: number;
  respondedCount: number;
  markedCount: number;
  averagePercent: number | null;
  fullMarksCount: number;
}

export interface PerformerEntry {
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  className: string;
  percentage: number;
}

export interface AssessmentAnalytics {
  summary: {
    eligibleCount: number;
    satCount: number;
    missedCount: number;
    markedCount: number;
    submittedNotMarkedCount: number;
    averagePercent: number | null;
    medianPercent: number | null;
    highestPercent: number | null;
    lowestPercent: number | null;
  };
  questionStats: QuestionStat[];
  distribution: { bucket: string; count: number }[];
  topPerformers: PerformerEntry[];
  bottomPerformers: PerformerEntry[];
}

export type AnalyticsSegment =
  | { type: "missed" }
  | { type: "bucket"; bucket: string }
  | { type: "question"; questionId: string };

export interface SegmentEntry {
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  className: string;
  value?: string;
}
