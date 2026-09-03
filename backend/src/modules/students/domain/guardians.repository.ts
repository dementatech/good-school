import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// Guardian *data* — no login here (see docs/design/accounts-module.md, out of
// scope for this phase). See docs/design/parent-guardian-module.md §1–2, §7.

export type GuardianRole = "parent" | "sponsor" | "guardian";
export type GuardianSource = "bulk_import" | "intake" | "self_registered";

export interface GuardianRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  nin: string | null;
  relationshipToStudent: string | null;
  source: GuardianSource;
  createdAt: string;
}

export interface StudentGuardianRecord extends GuardianRecord {
  role: GuardianRole;
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

export interface NewGuardianInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  nin?: string | null;
  relationshipToStudent?: string | null;
}

export interface GuardianLinkInput {
  role: GuardianRole;
  isPrimaryContact: boolean;
  isFeeResponsible: boolean;
  isEmergencyContact: boolean;
}

interface GuardianRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  nin: string | null;
  relationship_to_student: string | null;
  source: GuardianSource;
  created_at: string;
}

function mapGuardianRow(row: GuardianRow): GuardianRecord {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    nin: row.nin,
    relationshipToStudent: row.relationship_to_student,
    source: row.source,
    createdAt: row.created_at,
  };
}

// Normalizes for the phone match — strips everything but digits, drops a
// leading "0" or "256" country-code prefix so "0772123456" and
// "+256772123456" match the same guardian.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("256")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export async function searchGuardians(query: string): Promise<GuardianRecord[]> {
  const like = `%${query.trim()}%`;
  const result = await pool.query<GuardianRow>(
    `select id, first_name, last_name, phone, email, nin, relationship_to_student, source, created_at
     from guardian
     where merged_into_guardian_id is null
       and (first_name ilike $1 or last_name ilike $1 or phone ilike $1)
     order by first_name, last_name
     limit 20`,
    [like],
  );
  return result.rows.map(mapGuardianRow);
}

export async function findGuardianByPhone(
  client: PoolClient,
  phone: string,
): Promise<GuardianRecord | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const result = await client.query<GuardianRow>(
    `select id, first_name, last_name, phone, email, nin, relationship_to_student, source, created_at
     from guardian
     where merged_into_guardian_id is null
       and phone is not null
       and regexp_replace(phone, '\\D', '', 'g') like '%' || $1
     order by created_at
     limit 1`,
    [normalized],
  );
  return result.rows[0] ? mapGuardianRow(result.rows[0]) : null;
}

async function createGuardian(
  client: PoolClient,
  input: NewGuardianInput,
  source: GuardianSource,
): Promise<GuardianRecord> {
  const result = await client.query<GuardianRow>(
    `insert into guardian (first_name, last_name, phone, email, nin, relationship_to_student, source)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, first_name, last_name, phone, email, nin, relationship_to_student, source, created_at`,
    [
      input.firstName,
      input.lastName,
      input.phone ?? null,
      input.email ?? null,
      input.nin ?? null,
      input.relationshipToStudent ?? null,
      source,
    ],
  );
  return mapGuardianRow(result.rows[0]);
}

export async function linkGuardianToStudent(
  client: PoolClient,
  studentUserId: string,
  guardianId: string,
  link: GuardianLinkInput,
): Promise<void> {
  await client.query(
    `insert into student_guardian
       (student_user_id, guardian_id, role, is_primary_contact, is_fee_responsible, is_emergency_contact)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (student_user_id, guardian_id) do update
       set role = excluded.role,
           is_primary_contact = excluded.is_primary_contact,
           is_fee_responsible = excluded.is_fee_responsible,
           is_emergency_contact = excluded.is_emergency_contact`,
    [
      studentUserId,
      guardianId,
      link.role,
      link.isPrimaryContact,
      link.isFeeResponsible,
      link.isEmergencyContact,
    ],
  );
}

export async function unlinkGuardianFromStudent(
  studentUserId: string,
  guardianId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from student_guardian where student_user_id = $1 and guardian_id = $2`,
    [studentUserId, guardianId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listGuardiansForStudent(
  studentUserId: string,
): Promise<StudentGuardianRecord[]> {
  const result = await pool.query<GuardianRow & {
    role: GuardianRole;
    is_primary_contact: boolean;
    is_fee_responsible: boolean;
    is_emergency_contact: boolean;
  }>(
    `select g.id, g.first_name, g.last_name, g.phone, g.email, g.nin,
            g.relationship_to_student, g.source, g.created_at,
            sg.role, sg.is_primary_contact, sg.is_fee_responsible, sg.is_emergency_contact
     from student_guardian sg
     join guardian g on g.id = sg.guardian_id
     where sg.student_user_id = $1
     order by sg.is_primary_contact desc, g.first_name`,
    [studentUserId],
  );
  return result.rows.map((row) => ({
    ...mapGuardianRow(row),
    role: row.role,
    isPrimaryContact: row.is_primary_contact,
    isFeeResponsible: row.is_fee_responsible,
    isEmergencyContact: row.is_emergency_contact,
  }));
}

export class InvalidGuardianInputError extends Error {}

export interface MatchOrCreateResult {
  guardian: GuardianRecord;
  matched: boolean;
}

// docs/design/parent-guardian-module.md §2: exact phone match -> reuse;
// no match -> create new. Ambiguous name-only matches are NOT auto-linked
// here — that's the admin reconciliation screen (§4), deferred to Phase 3B.
export async function matchOrCreateGuardian(
  client: PoolClient,
  input: NewGuardianInput,
  source: GuardianSource,
): Promise<MatchOrCreateResult> {
  if (input.phone) {
    const existing = await findGuardianByPhone(client, input.phone);
    if (existing) return { guardian: existing, matched: true };
  }
  const guardian = await createGuardian(client, input, source);
  return { guardian, matched: false };
}
