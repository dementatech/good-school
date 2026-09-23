// Shapes returned by the student/parent "published results" read endpoints
// (roadmap Step 4) — GET /api/v1/exams/me[/:id] and the parent-side mirror at
// GET /api/v1/parent/results[/:id]. Kept alongside MarkSheet's types since
// both read from the same exam_result/grade_band data, just scoped to one
// student and published-only.

export interface PublishedExamSummary {
  id: string;
  name: string;
  termName: string;
  startsOn: string;
  endsOn: string;
  publishedAt: string;
}

export interface StudentVariantScore {
  variantId: string;
  name: string;
  rawScore: number | null;
  isAbsent: boolean;
}

export interface StudentSubjectResult {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  hasVariant: boolean;
  variantScores?: StudentVariantScore[];
  /** The mark as entered, out of maxMark (e.g. 38 of 50). */
  rawScore: number | null;
  maxMark: number;
  isAbsent: boolean;
  computedGrade: string | null;
  comment: string | null;
}

export interface StudentExamResult {
  exam: { id: string; name: string; termName: string; startsOn: string; endsOn: string; publishedAt: string };
  subjects: StudentSubjectResult[];
}
