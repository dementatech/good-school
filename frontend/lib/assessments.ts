/**
 * Assessment shapes — the PURE half of the old TERECO module.
 *
 * All Supabase data access (`getAssessments`, `saveQuestions`,
 * `getMarkedScript`, `releaseResults`, …) moved to the backend. The frontend
 * keeps only the types and small constant sets its components render against.
 */
import type { QuestionConfig } from "./questionGrouping";

export type AssessmentStatus = "draft" | "published" | "closed";

export interface Assessment {
  id: string;
  systemId: string;
  title: string;
  description: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status: AssessmentStatus;
  createdBy: string | null;
  instructions: string;
  resultsReleasedAt?: string;
  ePaperAt?: string;
  hiddenAt?: string;
  includeInEvaluation: boolean;
  targets: AssessmentTarget[];
  collaboratorIds: string[];
}

export interface AssessmentTarget {
  id: string;
  schoolId: string | null;
  level: number | null;
  classId: string | null;
  studentId: string | null;
}

export type QuestionType =
  | "mcq"
  | "checkbox"
  | "true_false"
  | "fill"
  | "matching"
  | "dragdrop"
  | "short"
  | "long";

/** Types the server can mark on its own. The rest need a human. */
export const AUTO_SCORED_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "mcq",
  "checkbox",
  "true_false",
  "fill",
]);

/** Types whose correct answer must be one of the entered options. */
export const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "mcq",
  "checkbox",
  "true_false",
]);

/** The fixed options for a true/false question — never author-supplied. */
export const TRUE_FALSE_OPTIONS = ["True", "False"];

export interface Question {
  id: string;
  position: number;
  code: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer?: string;
  modelAnswer?: string;
  imageUrl?: string;
  imagePublicId?: string;
  maxScore: number;
  config?: QuestionConfig;
}

export interface CreateAssessmentInput {
  title: string;
  description?: string;
  timeLimit: number;
  opensAt?: string;
  closesAt?: string;
  status?: AssessmentStatus;
  instructions?: string;
  targets?: Omit<AssessmentTarget, "id">[];
  createdBy?: string;
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string;
  timeLimit?: number;
  opensAt?: string | null;
  closesAt?: string | null;
  status?: AssessmentStatus;
  instructions?: string;
  isEPaper?: boolean;
  targets?: Omit<AssessmentTarget, "id">[];
}

export type AnswerVerdict = "correct" | "partial" | "wrong" | "unmarked";

export interface MarkedAnswer {
  questionId: string;
  position: number;
  code: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  imageUrl?: string;
  givenAnswer: string;
  correctAnswer?: string;
  modelAnswer?: string;
  score: number | null;
  maxScore: number;
  verdict: AnswerVerdict;
  config?: QuestionConfig;
}

export interface MarkedScript {
  studentId: string;
  assessmentSystemId: string;
  assessmentTitle: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  releasedAt: string | null;
  answers: MarkedAnswer[];
}

export interface AssessmentResult {
  submissionId: string;
  studentId: string;
  studentName: string;
  studentSystemId: string | null;
  school: string;
  className: string;
  submittedAt: string;
  timeSpentSeconds: number;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  status: string;
}

export const BEHAVIOR_ASSESSMENT_TITLE = "Behaviour Rating";
