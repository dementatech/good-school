import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";
import { nextSystemId } from "./system-id.js";
import {
  createEnrollment,
  getActiveEnrollment,
  type EnrollmentInput,
  type EnrollmentRecord,
} from "./enrollments.repository.js";
import {
  InvalidGuardianInputError,
  linkGuardianToStudent,
  listGuardiansForStudent,
  matchOrCreateGuardian,
  type GuardianLinkInput,
  type NewGuardianInput,
  type StudentGuardianRecord,
} from "./guardians.repository.js";

// Identity only (see docs/design/student-data-model.md §2) — no class,
// stream, or "current" anything on this table. "Where/when are they
// attending" lives entirely in student_enrollment.
export type LinStatus = "verified" | "pending" | "not_yet_issued";
export type Gender = "male" | "female";

export interface StudentRecord {
  userId: string;
  systemId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  lin: string | null;
  linStatus: LinStatus;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  activeEnrollment: EnrollmentRecord | null;
}

export interface StudentIdentityInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  lin?: string | null;
  linStatus?: LinStatus;
  email?: string | null;
  phoneNumber?: string | null;
}

export interface GuardianRow {
  guardianId?: string; // attach an existing guardian by id
  newGuardian?: NewGuardianInput; // or match-or-create from scratch
  role: GuardianLinkInput["role"];
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

export interface CreateStudentInput extends StudentIdentityInput {
  enrollment: EnrollmentInput;
  guardians: GuardianRow[];
}

interface StudentRow {
  user_id: string;
  system_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  gender: Gender | null;
  lin: string | null;
  lin_status: LinStatus;
  email: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
}

const SELECT_STUDENT = `
  select u.id as user_id, u.system_id, u.email, u.phone_number,
         s.first_name, s.middle_name, s.last_name, s.date_of_birth, s.gender,
         s.lin, s.lin_status, s.is_active, s.created_at
  from students s
  join users u on u.id = s.user_id
`;

function mapRow(row: StudentRow): Omit<StudentRecord, "activeEnrollment"> {
  return {
    userId: row.user_id,
    systemId: row.system_id,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    lin: row.lin,
    linStatus: row.lin_status,
    email: row.email,
    phoneNumber: row.phone_number,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function listStudents(schoolId: string): Promise<StudentRecord[]> {
  const result = await pool.query<StudentRow>(
    `${SELECT_STUDENT} where u.school_id = $1 order by s.first_name, s.last_name`,
    [schoolId],
  );
  const students = result.rows.map(mapRow);
  return Promise.all(
    students.map(async (student) => ({
      ...student,
      activeEnrollment: await getActiveEnrollment(schoolId, student.userId),
    })),
  );
}

export async function getStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  const result = await pool.query<StudentRow>(
    `${SELECT_STUDENT} where u.school_id = $1 and u.id = $2`,
    [schoolId, userId],
  );
  if (!result.rows[0]) return null;
  return {
    ...mapRow(result.rows[0]),
    activeEnrollment: await getActiveEnrollment(schoolId, userId),
  };
}

// One transaction: identity + users row + first enrollment + guardian(s),
// per docs/design/parent-guardian-module.md §2.5 ("one transaction ...
// even though guardian and student remain two separate tables underneath").
// A student is required to have at least one guardian and an enrollment at
// creation time — a student without either isn't meaningfully enrolled yet.
export async function createStudent(
  schoolId: string,
  input: CreateStudentInput,
): Promise<{
  student: StudentRecord;
  tempPassword: string;
  guardians: (StudentGuardianRecord & { matchedExisting: boolean })[];
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const systemId = await nextSystemId(client, schoolId, "STU");
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const userResult = await client.query<{ id: string }>(
      `insert into users (school_id, system_id, email, phone_number, password_hash, role)
       values ($1, $2, $3, $4, $5, 'student')
       returning id`,
      [schoolId, systemId, input.email ?? null, input.phoneNumber ?? null, passwordHash],
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `insert into students
         (user_id, first_name, middle_name, last_name, date_of_birth, gender, lin, lin_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        input.firstName,
        input.middleName ?? null,
        input.lastName,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.lin ?? null,
        input.linStatus ?? "not_yet_issued",
      ],
    );

    const activeEnrollment = await createEnrollment(client, schoolId, userId, input.enrollment);

    // Tracks match-or-create outcome per row so the frontend can surface
    // "linked to existing guardian" vs. "new guardian created" after submit
    // (docs/design/parent-guardian-module.md §2 calls for this visibility).
    const guardianMatches: { guardianId: string; matched: boolean }[] = [];
    for (const g of input.guardians) {
      let guardianId = g.guardianId;
      let matched = true;
      if (!guardianId) {
        if (!g.newGuardian) {
          throw new InvalidGuardianInputError("Each guardian needs either guardianId or newGuardian");
        }
        const result = await matchOrCreateGuardian(client, g.newGuardian, "intake");
        guardianId = result.guardian.id;
        matched = result.matched;
      }
      guardianMatches.push({ guardianId, matched });
      await linkGuardianToStudent(client, userId, guardianId, {
        role: g.role,
        isPrimaryContact: g.isPrimaryContact,
        isFeeResponsible: g.isFeeResponsible,
        isEmergencyContact: g.isEmergencyContact,
      });
    }

    await client.query("COMMIT");

    const identityRow = await client.query<StudentRow>(`${SELECT_STUDENT} where u.id = $1`, [
      userId,
    ]);
    const guardians = await listGuardiansForStudent(userId);
    const matchedById = new Map(guardianMatches.map((m) => [m.guardianId, m.matched]));

    return {
      student: { ...mapRow(identityRow.rows[0]), activeEnrollment },
      tempPassword,
      guardians: guardians.map((g) => ({ ...g, matchedExisting: matchedById.get(g.id) ?? false })),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStudent(
  schoolId: string,
  userId: string,
  input: StudentIdentityInput,
): Promise<StudentRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owns = await client.query(
      `select 1 from users where id = $1 and school_id = $2 and role = 'student'`,
      [userId, schoolId],
    );
    if (owns.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `update users set email = $1, phone_number = $2, updated_at = now() where id = $3`,
      [input.email ?? null, input.phoneNumber ?? null, userId],
    );

    await client.query(
      `update students
       set first_name = $1, middle_name = $2, last_name = $3, date_of_birth = $4,
           gender = $5, lin = $6, lin_status = $7, updated_at = now()
       where user_id = $8`,
      [
        input.firstName,
        input.middleName ?? null,
        input.lastName,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.lin ?? null,
        input.linStatus ?? "not_yet_issued",
        userId,
      ],
    );

    await client.query("COMMIT");

    return getStudent(schoolId, userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStudent(schoolId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from users where id = $1 and school_id = $2 and role = 'student'`,
    [userId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function setStudentActive(
  schoolId: string,
  userId: string,
  isActive: boolean,
): Promise<StudentRecord | null> {
  const owns = await pool.query(
    `select 1 from users where id = $1 and school_id = $2 and role = 'student'`,
    [userId, schoolId],
  );
  if (owns.rowCount === 0) return null;

  await pool.query(`update students set is_active = $1, updated_at = now() where user_id = $2`, [
    isActive,
    userId,
  ]);

  return getStudent(schoolId, userId);
}

// Soft delete — keeps academic history, just stops showing up as an active
// enrollment. Separate from deleteStudent, which is a hard, permanent delete.
export async function archiveStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  return setStudentActive(schoolId, userId, false);
}

export async function restoreStudent(schoolId: string, userId: string): Promise<StudentRecord | null> {
  return setStudentActive(schoolId, userId, true);
}

// Bulk reset for the "include passwords" export option — generates a fresh
// temp password per id and returns userId -> password. Silently skips any id
// that isn't actually a student in this school (no error for a stale/foreign
// id slipping into a batch), same spirit as the single-row helpers above.
export async function resetStudentPasswords(
  schoolId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query<{ id: string }>(
      `select id from users where school_id = $1 and role = 'student' and id = any($2::uuid[])`,
      [schoolId, userIds],
    );

    const passwords: Record<string, string> = {};
    for (const row of owned.rows) {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      await client.query(`update users set password_hash = $1, updated_at = now() where id = $2`, [
        passwordHash,
        row.id,
      ]);
      passwords[row.id] = tempPassword;
    }

    await client.query("COMMIT");
    return passwords;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type { EnrollmentRecord, StudentGuardianRecord };
export {
  createEnrollment,
  withdrawEnrollment,
  listEnrollments,
} from "./enrollments.repository.js";
export {
  searchGuardians,
  listGuardiansForStudent,
  linkGuardianToStudent,
  unlinkGuardianFromStudent,
  matchOrCreateGuardian,
  InvalidGuardianInputError,
} from "./guardians.repository.js";
export { UnknownReferenceError, ActiveEnrollmentExistsError } from "./enrollments.repository.js";

export type { StudentSubjectRecord } from "./student-subjects.repository.js";
export {
  addStudentSubject,
  listStudentSubjects,
  setStudentSubjectStatus,
  CompulsorySubjectError,
  SubjectNotOfferedError,
} from "./student-subjects.repository.js";

export type { StudentCombinationRecord } from "./student-combinations.repository.js";
export {
  getCurrentCombination,
  listCombinationHistory,
  selectCombination,
  reassignCombination,
  InvalidSubsidiaryError,
  ActiveCombinationExistsError,
  UnknownReferenceError as UnknownCombinationReferenceError,
} from "./student-combinations.repository.js";
