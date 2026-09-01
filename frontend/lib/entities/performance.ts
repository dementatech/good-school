/**
 * Performance shapes — the PURE half of the old TERECO entity.
 *
 * The Supabase blend/aggregation logic moved to the backend; the frontend
 * keeps only the response type its report cards render against.
 */

export interface StudentTermPerformance {
  termId: string;
  termNumber: number;
  assessmentScore: number | null;
  behaviourScore: number | null;
  attendanceRate: number | null;
  weight: number;
  overall: number;
}
