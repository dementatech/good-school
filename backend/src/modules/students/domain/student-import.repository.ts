import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { pool } from "../../../shared/db/index.js";
import { generateTempPassword, hashPassword } from "../../auth/index.js";
import { nextSystemId } from "../../../shared/system-id.js";
import { createEnrollment } from "./enrollments.repository.js";
import { DuplicatePaymentCodeError, setPaymentCode } from "./payment-codes.repository.js";

// Bulk upload of *pre-existing* students for a school migrating in — the
// counterpart to the single-student admission wizard. Deliberately looser
// than admission: no guardian required (docs/design/student-data-model.md §5
// expects thin guardian data here), payment code optional (§3 of
// student-enrollment.md — flag the gap, don't block), and safe to re-run
// (a row matching an already-enrolled student is skipped, not duplicated).
//
// Every row is imported in its own transaction so one bad row never rolls
// back the whole batch.

// The columns the admin fills in. Order matters — it's the header row of the
// generated template and what the parser maps positionally as a fallback.
export const TEMPLATE_COLUMNS = [
  "first_name",
  "last_name",
  "other_names",
  "class",
  "stream",
  "payment_code",
  "LIN",
] as const;

export interface ImportRow {
  row: number; // 1-based spreadsheet row (header is row 1, first student row 2)
  firstName: string;
  lastName: string;
  otherNames: string | null;
  className: string;
  streamName: string | null;
  paymentCode: string | null;
  lin: string | null;
}

export interface ImportRowResult {
  row: number;
  name: string;
  status: "created" | "skipped" | "error";
  systemId?: string;
  temporaryPassword?: string;
  note?: string;
  error?: string;
}

const isPgUniqueViolation = (err: unknown): err is { code: string; constraint?: string } =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
};

// ─── template ────────────────────────────────────────────────────────────────

interface ClassStreamRef {
  className: string;
  classCode: string;
  streams: string[];
}

async function currentYearClassRefs(schoolId: string): Promise<{
  yearName: string | null;
  classes: ClassStreamRef[];
}> {
  const year = await pool.query<{ id: string; year_name: string }>(
    `select id, year_name from academic_years where school_id = $1 and is_current`,
    [schoolId],
  );
  if (year.rowCount === 0) return { yearName: null, classes: [] };

  const rows = await pool.query<{ name: string; code: string; stream: string | null }>(
    `select cs.name, cs.code, st.name as stream
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
       left join streams st on st.class_id = c.id and st.is_active
      where c.school_id = $1 and c.academic_year_id = $2 and c.is_active
      order by cs.sequence_number, st.name`,
    [schoolId, year.rows[0].id],
  );

  const byClass = new Map<string, ClassStreamRef>();
  for (const r of rows.rows) {
    const entry = byClass.get(r.code) ?? { className: r.name, classCode: r.code, streams: [] };
    if (r.stream) entry.streams.push(r.stream);
    byClass.set(r.code, entry);
  }
  return { yearName: year.rows[0].year_name, classes: [...byClass.values()] };
}

export async function buildImportTemplate(schoolId: string): Promise<Buffer> {
  const { yearName, classes } = await currentYearClassRefs(schoolId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "School OS";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Students");
  sheet.columns = TEMPLATE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: key === "class" || key === "payment_code" ? 16 : 20,
  }));
  sheet.getRow(1).font = { bold: true };

  const ref = wb.addWorksheet("Reference");
  ref.addRow(["How to fill in the Students sheet"]);
  ref.getRow(1).font = { bold: true, size: 13 };
  ref.addRow([]);
  ref.addRow(["first_name, last_name, class — required on every row."]);
  ref.addRow(["other_names — any middle names, or leave blank."]);
  ref.addRow([
    "payment_code — the student's SchoolPay code. Optional here, but fill it in wherever known so fee payments reconcile.",
  ]);
  ref.addRow(["LIN — the Learner Identification Number. Optional; leave blank if not yet issued."]);
  ref.addRow([
    "class / stream — copy the exact names from the list below. Unknown names fail that row and tell you what was expected.",
  ]);
  ref.addRow([
    'Example row:  "Jane" | "Namukasa" | "Grace" | "' +
      (classes[0]?.className ?? "Senior 1") +
      '" | "' +
      (classes[0]?.streams[0] ?? "") +
      '" | "SP-000123" | ""',
  ]);
  ref.addRow([]);
  ref.addRow([
    yearName
      ? `Current academic year: ${yearName}. Every student is enrolled here.`
      : "WARNING: no current academic year is set for this school — set one before importing, or every row will fail.",
  ]);
  ref.addRow([]);
  ref.addRow(["class", "streams"]);
  ref.lastRow!.font = { bold: true };
  for (const c of classes) {
    ref.addRow([c.className, c.streams.join(", ") || "(no streams)"]);
  }
  ref.getColumn(1).width = 26;
  ref.getColumn(2).width = 70;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// ─── parsing ─────────────────────────────────────────────────────────────────

// Minimal RFC-4180 CSV: quoted fields, "" escapes, CRLF or LF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

const normHeader = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

// Column position by header name. Positional layout (TEMPLATE_COLUMNS order)
// is the fallback only when the first row isn't a recognizable header.
const POSITIONAL: Record<string, number> = {
  first_name: 0,
  last_name: 1,
  other_names: 2,
  class: 3,
  stream: 4,
  payment_code: 5,
  lin: 6,
};

function headerIndex(header: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    map[normHeader(h)] = i;
  });
  // Only treat row 1 as a header when it actually names the key columns —
  // otherwise a headerless file's first student would be silently dropped.
  return "first_name" in map && "last_name" in map ? map : null;
}

function rowToImportRow(
  values: string[],
  idx: Record<string, number>,
  rowNumber: number,
): ImportRow | null {
  const at = (key: string): string => {
    const pos = idx[key];
    return pos === undefined ? "" : clean(values[pos]);
  };
  const firstName = at("first_name");
  const lastName = at("last_name");
  const otherNames = at("other_names");
  const className = at("class");
  const streamName = at("stream");
  const paymentCode = at("payment_code");
  const lin = at("lin");

  if (!firstName && !lastName && !className) return null; // blank line

  return {
    row: rowNumber,
    firstName,
    lastName,
    otherNames: otherNames || null,
    className,
    streamName: streamName || null,
    paymentCode: paymentCode || null,
    lin: lin || null,
  };
}

export async function parseImportFile(buffer: Buffer, filename: string): Promise<ImportRow[]> {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const matrix: string[][] = [];

  if (isCsv) {
    matrix.push(...parseCsv(buffer.toString("utf8")));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("Students") ?? wb.worksheets[0];
    if (!sheet) return [];
    sheet.eachRow({ includeEmpty: false }, (r) => {
      const values = Array.isArray(r.values) ? r.values.slice(1) : [];
      matrix.push(values.map(clean));
    });
  }

  if (matrix.length === 0) return [];

  const header = headerIndex(matrix[0]);
  const idx = header ?? POSITIONAL;
  const firstDataRow = header ? 1 : 0;

  const out: ImportRow[] = [];
  for (let i = firstDataRow; i < matrix.length; i++) {
    const parsed = rowToImportRow(matrix[i], idx, i + 1);
    if (parsed) out.push(parsed);
  }
  return out;
}

// ─── import ──────────────────────────────────────────────────────────────────

const fullName = (r: ImportRow) =>
  [r.firstName, r.otherNames, r.lastName].filter(Boolean).join(" ").trim() || `Row ${r.row}`;

interface ResolvedClass {
  classId: string;
  hasStreams: boolean;
}

async function resolveClass(
  client: PoolClient,
  schoolId: string,
  academicYearId: string,
  className: string,
): Promise<ResolvedClass | null> {
  const res = await client.query<{ id: string; has_streams: boolean }>(
    `select c.id, c.has_streams
       from classes c
       join curriculum_stage cs on cs.id = c.curriculum_stage_id
      where c.school_id = $1 and c.academic_year_id = $2 and c.is_active
        and (lower(cs.name) = lower($3) or lower(cs.code) = lower($3))
      limit 1`,
    [schoolId, academicYearId, className],
  );
  return res.rows[0] ? { classId: res.rows[0].id, hasStreams: res.rows[0].has_streams } : null;
}

async function importOne(
  schoolId: string,
  actingUserId: string,
  academicYearId: string,
  entryDate: string,
  input: ImportRow,
): Promise<ImportRowResult> {
  const name = fullName(input);
  if (!input.firstName || !input.lastName) {
    return { row: input.row, name, status: "error", error: "Missing first or last name" };
  }
  if (!input.className) {
    return { row: input.row, name, status: "error", error: "Missing class" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cls = await resolveClass(client, schoolId, academicYearId, input.className);
    if (!cls) {
      await client.query("ROLLBACK");
      return {
        row: input.row,
        name,
        status: "error",
        error: `Unknown class "${input.className}" for the current academic year`,
      };
    }

    let streamId: string | null = null;
    if (input.streamName) {
      const stream = await client.query<{ id: string }>(
        `select id from streams where school_id = $1 and class_id = $2 and lower(name) = lower($3) limit 1`,
        [schoolId, cls.classId, input.streamName],
      );
      if (stream.rowCount === 0) {
        await client.query("ROLLBACK");
        return {
          row: input.row,
          name,
          status: "error",
          error: `Unknown stream "${input.streamName}" for class "${input.className}"`,
        };
      }
      streamId = stream.rows[0].id;
    }

    // Re-run safety: same name already actively enrolled in this class this year.
    const dupe = await client.query(
      `select 1
         from users u
         join students s on s.user_id = u.id
         join student_enrollment se on se.student_user_id = u.id and se.status = 'active'
        where u.school_id = $1 and se.class_id = $2
          and lower(s.first_name) = lower($3) and lower(s.last_name) = lower($4)`,
      [schoolId, cls.classId, input.firstName, input.lastName],
    );
    if ((dupe.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return {
        row: input.row,
        name,
        status: "skipped",
        note: "Already enrolled in this class — not duplicated",
      };
    }

    const systemId = await nextSystemId(client, "S");
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const userResult = await client.query<{ id: string }>(
      `insert into users (school_id, system_id, password_hash, role)
       values ($1, $2, $3, 'student')
       returning id`,
      [schoolId, systemId, passwordHash],
    );
    const userId = userResult.rows[0].id;

    try {
      await client.query(
        `insert into students
           (user_id, first_name, middle_name, last_name, lin, lin_status)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          input.firstName,
          input.otherNames,
          input.lastName,
          input.lin,
          input.lin ? "pending" : "not_yet_issued",
        ],
      );
    } catch (err) {
      await client.query("ROLLBACK");
      if (isPgUniqueViolation(err)) {
        return { row: input.row, name, status: "error", error: `LIN "${input.lin}" is already in use` };
      }
      throw err;
    }

    if (input.paymentCode) {
      try {
        await setPaymentCode(client, schoolId, userId, input.paymentCode, actingUserId);
      } catch (err) {
        await client.query("ROLLBACK");
        if (err instanceof DuplicatePaymentCodeError) {
          return { row: input.row, name, status: "error", error: err.message };
        }
        throw err;
      }
    }

    await createEnrollment(client, schoolId, userId, {
      academicYearId,
      classId: cls.classId,
      streamId,
      entryDate,
      entryType: "new_admission",
    });

    await client.query("COMMIT");

    const note =
      cls.hasStreams && !streamId
        ? input.paymentCode
          ? "No stream set"
          : "No stream or payment code set"
        : input.paymentCode
          ? undefined
          : "No payment code set";

    return {
      row: input.row,
      name,
      status: "created",
      systemId,
      temporaryPassword: tempPassword,
      note,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    return {
      row: input.row,
      name,
      status: "error",
      error: err instanceof Error ? err.message : "Unexpected error",
    };
  } finally {
    client.release();
  }
}

export async function importStudents(
  schoolId: string,
  actingUserId: string,
  rows: ImportRow[],
): Promise<ImportRowResult[]> {
  if (rows.length === 0) return [];

  const year = await pool.query<{ id: string }>(
    `select id from academic_years where school_id = $1 and is_current`,
    [schoolId],
  );
  if (year.rowCount === 0) {
    return rows.map((r) => ({
      row: r.row,
      name: fullName(r),
      status: "error" as const,
      error: "No current academic year is set for this school",
    }));
  }
  const academicYearId = year.rows[0].id;
  const entryDate = new Date().toISOString().slice(0, 10);

  const results: ImportRowResult[] = [];
  for (const row of rows) {
    results.push(await importOne(schoolId, actingUserId, academicYearId, entryDate, row));
  }
  return results;
}
