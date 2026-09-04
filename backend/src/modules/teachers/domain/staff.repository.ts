import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";
import { nextSystemId } from "../../../shared/system-id.js";
import {
  deleteStoredFile,
  fileUrl,
  storeFile,
  UnsupportedFileTypeError,
  type StorageProvider,
} from "../../../shared/media.js";
import {
  createAssignment,
  getActiveAssignmentAtSchool,
  type StaffAssignmentInput,
  type StaffAssignmentRecord,
} from "./staff-assignment.repository.js";
import { addSpecialization, listSpecializations } from "./staff-specialization.repository.js";

// Identity only (docs/design/teachers-module.md §1, mirroring
// student-data-model.md §2's discipline) — no school, role, or "current"
// anything on this table. "Where/when do they work, and as what" lives
// entirely in staff_assignment.
//
// Departure from the doc's literal column list: phone/email live on `users`
// here, not duplicated onto `staff` — see the migration's comment.
export type TmisStatus = "registered" | "pending" | "not_registered";
export type Gender = "male" | "female";
export type EmploymentType = "government" | "private" | "pta" | "volunteer";
// A different axis from EmploymentType (who pays vs. time commitment) — kept
// as its own nullable column rather than folded into employment_type, so
// neither classification is lost. See the migration's comment.
export type EmploymentBasis = "fulltime" | "parttime" | "practicing";
// The broad HR grouping the Staff page's tabs are organized around — a
// separate dimension from EmploymentType/EmploymentBasis (why they're paid /
// how much time they give) and from staff_assignment.role (their specific
// job title). Drives which fields the hire form actually asks for: e.g.
// subject specialization only makes sense for 'teaching'.
export type StaffCategory = "administration" | "teaching" | "non_teaching" | "support";

export interface StaffRecord {
  userId: string;
  systemId: string | null;
  category: StaffCategory;
  tmisNumber: string | null;
  tmisStatus: TmisStatus;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  qualification: string | null;
  employmentType: EmploymentType;
  employmentBasis: EmploymentBasis | null;
  photoUrl: string | null;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  activeAssignment: StaffAssignmentRecord | null;
  specializations: { subjectId: string; subjectCode: string; subjectName: string }[];
}

export interface StaffIdentityInput {
  category: StaffCategory;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  tmisNumber?: string | null;
  tmisStatus?: TmisStatus;
  qualification?: string | null;
  employmentType: EmploymentType;
  employmentBasis?: EmploymentBasis | null;
  email?: string | null;
  phoneNumber?: string | null;
}

export interface CreateStaffInput extends StaffIdentityInput {
  assignment: StaffAssignmentInput;
  specializationSubjectIds?: string[];
}

interface StaffRow {
  user_id: string;
  system_id: string | null;
  category: StaffCategory;
  tmis_number: string | null;
  tmis_status: TmisStatus;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  gender: Gender | null;
  qualification: string | null;
  employment_type: EmploymentType;
  employment_basis: EmploymentBasis | null;
  photo_path: string | null;
  photo_provider: StorageProvider | null;
  email: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
}

const SELECT_STAFF = `
  select u.id as user_id, u.system_id, u.email, u.phone_number,
         s.category, s.tmis_number, s.tmis_status, s.first_name, s.middle_name, s.last_name,
         s.date_of_birth, s.gender, s.qualification, s.employment_type, s.employment_basis,
         s.photo_path, s.photo_provider, s.is_active, s.created_at
  from staff s
  join users u on u.id = s.user_id
`;

function mapRow(row: StaffRow): Omit<StaffRecord, "activeAssignment" | "specializations"> {
  return {
    userId: row.user_id,
    systemId: row.system_id,
    category: row.category,
    tmisNumber: row.tmis_number,
    tmisStatus: row.tmis_status,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    qualification: row.qualification,
    employmentType: row.employment_type,
    employmentBasis: row.employment_basis,
    // Photos are always images by construction (setStaffPhoto only accepts
    // image mime types) — a placeholder image/* mimeType is enough for
    // fileUrl() to pick Cloudinary's "image" resource type correctly.
    photoUrl: row.photo_path
      ? fileUrl({ provider: row.photo_provider ?? "local", ref: row.photo_path, mimeType: "image/jpeg" })
      : null,
    email: row.email,
    phoneNumber: row.phone_number,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function hydrate(
  schoolId: string,
  row: Omit<StaffRecord, "activeAssignment" | "specializations">,
): Promise<StaffRecord> {
  const [activeAssignment, specializations] = await Promise.all([
    getActiveAssignmentAtSchool(schoolId, row.userId),
    listSpecializations(row.userId),
  ]);
  return { ...row, activeAssignment, specializations };
}

export async function listStaff(schoolId: string): Promise<StaffRecord[]> {
  const result = await pool.query<StaffRow>(
    `${SELECT_STAFF} where u.school_id = $1 order by s.first_name, s.last_name`,
    [schoolId],
  );
  return Promise.all(result.rows.map((row) => hydrate(schoolId, mapRow(row))));
}

export async function getStaff(schoolId: string, userId: string): Promise<StaffRecord | null> {
  const result = await pool.query<StaffRow>(`${SELECT_STAFF} where u.school_id = $1 and u.id = $2`, [
    schoolId,
    userId,
  ]);
  if (!result.rows[0]) return null;
  return hydrate(schoolId, mapRow(result.rows[0]));
}

// One transaction: identity + users row + first assignment + specializations
// (if given at intake). A staff record is required to have an assignment at
// creation time, same discipline as createStudent requiring an enrollment —
// a staff member without one isn't meaningfully working at this school yet.
//
// `users.role` is always 'teacher' here regardless of `assignment.role`
// (which may be head_teacher/deputy/bursar/support/admin) — the auth Role
// enum has no separate login role per job function, and 'school_admin' is
// reserved for the account created at school onboarding. staff_assignment.role
// is what actually distinguishes a bursar from a class teacher in the UI.
export async function createStaff(
  schoolId: string,
  input: CreateStaffInput,
): Promise<{ staff: StaffRecord; tempPassword: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const systemId = await nextSystemId(client, schoolId, "TCH");
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const userResult = await client.query<{ id: string }>(
      `insert into users (school_id, system_id, email, phone_number, password_hash, role)
       values ($1, $2, $3, $4, $5, 'teacher')
       returning id`,
      [schoolId, systemId, input.email ?? null, input.phoneNumber ?? null, passwordHash],
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `insert into staff
         (user_id, category, tmis_number, tmis_status, first_name, middle_name, last_name,
          date_of_birth, gender, qualification, employment_type, employment_basis)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        input.category,
        input.tmisNumber ?? null,
        input.tmisStatus ?? "not_registered",
        input.firstName,
        input.middleName ?? null,
        input.lastName,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.qualification ?? null,
        input.employmentType,
        input.employmentBasis ?? null,
      ],
    );

    await createAssignment(client, schoolId, userId, input.assignment);

    for (const subjectId of input.specializationSubjectIds ?? []) {
      await client.query(
        `insert into staff_subject_specialization (staff_id, subject_id)
         values ($1, $2)
         on conflict (staff_id, subject_id) do nothing`,
        [userId, subjectId],
      );
    }

    await client.query("COMMIT");

    return { staff: (await getStaff(schoolId, userId))!, tempPassword };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStaff(
  schoolId: string,
  userId: string,
  input: StaffIdentityInput,
): Promise<StaffRecord | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owns = await client.query(
      `select 1 from users where id = $1 and school_id = $2 and role = 'teacher'`,
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
      `update staff
       set category = $1, tmis_number = $2, tmis_status = $3, first_name = $4, middle_name = $5,
           last_name = $6, date_of_birth = $7, gender = $8, qualification = $9, employment_type = $10,
           employment_basis = $11, updated_at = now()
       where user_id = $12`,
      [
        input.category,
        input.tmisNumber ?? null,
        input.tmisStatus ?? "not_registered",
        input.firstName,
        input.middleName ?? null,
        input.lastName,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.qualification ?? null,
        input.employmentType,
        input.employmentBasis ?? null,
        userId,
      ],
    );

    await client.query("COMMIT");
    return getStaff(schoolId, userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStaff(schoolId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from users where id = $1 and school_id = $2 and role = 'teacher'`,
    [userId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function setStaffActive(
  schoolId: string,
  userId: string,
  isActive: boolean,
): Promise<StaffRecord | null> {
  const owns = await pool.query(
    `select 1 from users where id = $1 and school_id = $2 and role = 'teacher'`,
    [userId, schoolId],
  );
  if (owns.rowCount === 0) return null;

  await pool.query(`update staff set is_active = $1, updated_at = now() where user_id = $2`, [
    isActive,
    userId,
  ]);

  return getStaff(schoolId, userId);
}

// Soft delete — keeps teaching history, just stops showing up as active.
// Separate from deleteStaff, which is a hard, permanent delete.
export async function archiveStaff(schoolId: string, userId: string): Promise<StaffRecord | null> {
  return setStaffActive(schoolId, userId, false);
}

export async function restoreStaff(schoolId: string, userId: string): Promise<StaffRecord | null> {
  return setStaffActive(schoolId, userId, true);
}

// Bulk reset for the "include passwords" export option, same shape as
// resetStudentPasswords — generates a fresh temp password per id, silently
// skipping any id that isn't actually staff in this school.
export async function resetStaffPasswords(
  schoolId: string,
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query<{ id: string }>(
      `select id from users where school_id = $1 and role = 'teacher' and id = any($2::uuid[])`,
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

// Uploads a new photo (replacing and deleting any prior one — via Cloudinary
// when configured, local disk otherwise, see shared/media.ts) or, given
// `null`, clears it back to the default initials avatar the frontend renders
// when photoUrl is null.
export async function setStaffPhoto(
  schoolId: string,
  userId: string,
  file: { mimeType: string; data: Buffer } | null,
): Promise<StaffRecord | null> {
  const existing = await pool.query<{ photo_path: string | null; photo_provider: StorageProvider | null }>(
    `select s.photo_path, s.photo_provider from staff s
     join users u on u.id = s.user_id
     where u.id = $1 and u.school_id = $2 and u.role = 'teacher'`,
    [userId, schoolId],
  );
  if (!existing.rows[0]) return null;
  const prior = existing.rows[0];

  let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
  if (file) {
    stored = await storeFile("staff", file.mimeType, file.data);
  }

  await pool.query(
    `update staff set photo_path = $1, photo_provider = $2, updated_at = now() where user_id = $3`,
    [stored?.ref ?? null, stored?.provider ?? null, userId],
  );

  if (prior.photo_path) {
    await deleteStoredFile({ provider: prior.photo_provider ?? "local", ref: prior.photo_path, mimeType: "image/jpeg" });
  }

  return getStaff(schoolId, userId);
}

export { UnsupportedFileTypeError };
export { addSpecialization };
export type { StaffAssignmentRecord, StaffAssignmentInput };
export {
  createAssignment,
  endAssignment,
  listAssignments,
  UnknownReferenceError,
  ActiveAssignmentExistsError,
  RoleNotAllowedForCategoryError,
} from "./staff-assignment.repository.js";
export {
  listSpecializations,
  removeSpecialization,
  UnknownSubjectError,
} from "./staff-specialization.repository.js";

export type { StaffDocumentRecord } from "./staff-documents.repository.js";
export {
  addStaffDocument,
  listStaffDocuments,
  removeStaffDocument,
} from "./staff-documents.repository.js";
