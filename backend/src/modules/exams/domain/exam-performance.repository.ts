import { pool } from "../../../shared/db/index.js";
import { getExamReportCard } from "./exam-results.repository.js";

const PASS_MARK = 40;

export interface ExamPerformance {
  examId: string;
  /** Short heading, e.g. "T3 MID". */
  label: string;
  name: string;
  termName: string;
  startsOn: string;
  publishedAt: string | null;
  /** Learners on the report, and how many have at least one score. */
  roster: number;
  scored: number;
  /** Mean of the learners' overall averages (A-Level: principal subjects). */
  average: number | null;
  /** Share of scored learners at or above the pass mark. */
  passRate: number | null;
  subjects: { subjectId: string; subjectName: string; subjectShortName: string; average: number | null }[];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/** Oldest first. Exams with no marks at all for this class are left out. */
export async function getClassPerformance(
  schoolId: string,
  classId: string,
  streamId: string | null,
  academicYearId: string,
  termId: string | null,
): Promise<ExamPerformance[]> {
  const { rows: exams } = await pool.query<{
    id: string;
    name: string;
    term_name: string;
    term_number: number;
    exam_code: string;
    starts_on: string;
    published_at: Date | null;
  }>(
    `select se.id, se.name, t.name as term_name, t.term_number, es.exam_code, se.starts_on, se.published_at
       from school_exam se
       join terms t on t.id = se.term_id
       join exam_session es on es.id = se.exam_session_id
      where se.school_id = $1 and se.academic_year_id = $2 and ($3::uuid is null or se.term_id = $3::uuid)
      order by se.starts_on, se.created_at`,
    [schoolId, academicYearId, termId],
  );

  const out: ExamPerformance[] = [];
  // One at a time: each report is several queries, and a year has few exams.
  for (const exam of exams) {
    const report = await getExamReportCard(schoolId, exam.id, classId, streamId);
    const overall = report.students
      .map((s) => (report.class.phase === "A_LEVEL" ? s.principalAverage : s.average))
      .filter((v): v is number => v !== null);
    if (overall.length === 0) continue;

    const bySubject = new Map<string, number[]>();
    for (const student of report.students) {
      for (const subject of student.subjects) {
        if (subject.isAbsent || subject.rawScore === null) continue;
        const scores = bySubject.get(subject.subjectId) ?? [];
        scores.push(subject.rawScore);
        bySubject.set(subject.subjectId, scores);
      }
    }

    out.push({
      examId: exam.id,
      label: `T${exam.term_number} ${exam.exam_code}`,
      name: exam.name,
      termName: exam.term_name,
      startsOn: exam.starts_on,
      publishedAt: exam.published_at ? exam.published_at.toISOString() : null,
      roster: report.students.length,
      scored: overall.length,
      average: mean(overall),
      passRate: Math.round((overall.filter((v) => v >= PASS_MARK).length / overall.length) * 100),
      subjects: report.classSubjects.map((subject) => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectShortName: subject.subjectShortName,
        average: mean(bySubject.get(subject.subjectId) ?? []),
      })),
    });
  }
  return out;
}
