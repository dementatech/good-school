import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";

// The per-school SchoolPay payment code for a student. See
// docs/design/student-data-model.md §6 and the
// 1700000047000_student-payment-code migration. Only one code is "active"
// per (student, school, provider) at a time; superseding a code keeps the
// old row (is_active = false) so historical payments still resolve.

export type PaymentProvider = "schoolpay";

export class DuplicatePaymentCodeError extends Error {
  constructor(code: string) {
    super(`Payment code "${code}" is already assigned to another student at this school`);
    this.name = "DuplicatePaymentCodeError";
  }
}

const isPgUniqueViolation = (err: unknown): err is { code: string } =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

export async function getActivePaymentCode(
  schoolId: string,
  studentUserId: string,
  provider: PaymentProvider = "schoolpay",
): Promise<string | null> {
  const result = await pool.query<{ external_payment_code: string }>(
    `select external_payment_code from student_payment_code
     where school_id = $1 and student_user_id = $2 and provider = $3 and is_active
     limit 1`,
    [schoolId, studentUserId, provider],
  );
  return result.rows[0]?.external_payment_code ?? null;
}

// Idempotent: a no-op when the student already has this exact active code.
// Deactivates any other active code for the student first, then inserts the
// new one. Rejects a code already active for a different student in the same
// school (the reconciliation key must stay unambiguous).
export async function setPaymentCode(
  client: PoolClient,
  schoolId: string,
  studentUserId: string,
  code: string,
  actingUserId: string | null,
  provider: PaymentProvider = "schoolpay",
): Promise<void> {
  const trimmed = code.trim();
  if (!trimmed) return;

  const existing = await client.query<{ external_payment_code: string }>(
    `select external_payment_code from student_payment_code
     where school_id = $1 and student_user_id = $2 and provider = $3 and is_active`,
    [schoolId, studentUserId, provider],
  );
  if (existing.rows[0]?.external_payment_code === trimmed) return;

  const clash = await client.query(
    `select 1 from student_payment_code
     where school_id = $1 and provider = $2 and external_payment_code = $3
       and is_active and student_user_id <> $4`,
    [schoolId, provider, trimmed, studentUserId],
  );
  if ((clash.rowCount ?? 0) > 0) throw new DuplicatePaymentCodeError(trimmed);

  await client.query(
    `update student_payment_code set is_active = false
     where school_id = $1 and student_user_id = $2 and provider = $3 and is_active`,
    [schoolId, studentUserId, provider],
  );

  try {
    await client.query(
      `insert into student_payment_code
         (student_user_id, school_id, provider, external_payment_code, linked_by)
       values ($1, $2, $3, $4, $5)`,
      [studentUserId, schoolId, provider, trimmed, actingUserId],
    );
  } catch (err) {
    if (isPgUniqueViolation(err)) throw new DuplicatePaymentCodeError(trimmed);
    throw err;
  }
}
