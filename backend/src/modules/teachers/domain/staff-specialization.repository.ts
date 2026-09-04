import { pool } from "../../../shared/db/index.js";

// Which subjects a staff member is generally qualified to teach — used to
// populate a sensible candidate list when allocating (teachers-module.md
// §3, §4.2). Deliberately separate from subject_teacher_assignment: this
// changes rarely, that changes every year or when staff turn over. Don't
// conflate the two.

export interface StaffSpecializationRecord {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export class UnknownSubjectError extends Error {
  constructor() {
    super("Unknown subject");
    this.name = "UnknownSubjectError";
  }
}

export async function listSpecializations(staffId: string): Promise<StaffSpecializationRecord[]> {
  const result = await pool.query<StaffSpecializationRecord>(
    `select s.id as "subjectId", s.code as "subjectCode", s.name as "subjectName"
     from staff_subject_specialization sss
     join subject s on s.id = sss.subject_id
     where sss.staff_id = $1
     order by s.name`,
    [staffId],
  );
  return result.rows;
}

export async function addSpecialization(staffId: string, subjectId: string): Promise<void> {
  const owned = await pool.query(`select 1 from subject where id = $1`, [subjectId]);
  if (owned.rowCount === 0) throw new UnknownSubjectError();

  await pool.query(
    `insert into staff_subject_specialization (staff_id, subject_id)
     values ($1, $2)
     on conflict (staff_id, subject_id) do nothing`,
    [staffId, subjectId],
  );
}

export async function removeSpecialization(staffId: string, subjectId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from staff_subject_specialization where staff_id = $1 and subject_id = $2`,
    [staffId, subjectId],
  );
  return (result.rowCount ?? 0) > 0;
}
