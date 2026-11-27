/**
 * SQL condition: this exam_result row is NOT for a subject the student has
 * dropped that academic year. A student whose combination changes keeps the
 * marks of the old subjects (nothing is deleted, and re-adding a subject
 * brings them back), but they must not count on report cards, mark sheets,
 * averages or rankings — otherwise an A-Level student who switched
 * combinations shows five principal subjects.
 *
 * `result` is the exam_result alias; `academicYear` is an SQL expression for
 * the exam's academic year id.
 */
export function notDroppedSubject(result: string, academicYear: string): string {
  return `not exists (
    select 1 from student_subject ssd
     where ssd.student_user_id = ${result}.student_user_id
       and ssd.subject_id = ${result}.subject_id
       and ssd.academic_year_id = ${academicYear}
       and ssd.status = 'dropped')`;
}
