import { randomBytes } from "node:crypto";
import { pool } from "../../../shared/db/index.js";
import { deleteStoredFile, fileUrl, storeFile, type StorageProvider, type StoredFile } from "../../../shared/media.js";
import type { Role } from "../../../shared/types/index.js";

export type EventType = "holiday" | "exam" | "meeting" | "deadline" | "other";
export type EventAudience = "all" | "staff" | "students" | "parents";

export interface SchoolEventRecord {
  id: string;
  /** null = a global platform event (super_admin-managed, shown on every school's calendar). */
  schoolId: string | null;
  title: string;
  description: string | null;
  eventDate: string;
  eventType: EventType;
  audience: EventAudience;
  /** Set when this event is the auto-synced marker for a school_exam — see
   *  syncEventForExam. Not directly editable/deletable through the manual
   *  CRUD routes; edit the exam instead. */
  schoolExamId: string | null;
  thumbnailUrl: string | null;
  /** Set once the event has a public link; null means the event is private. */
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything a public event page shows. Deliberately excludes audience, ids and
 *  who created it: this is readable by anyone holding the link. */
export interface PublicEvent {
  title: string;
  description: string | null;
  eventDate: string;
  eventType: EventType;
  thumbnailUrl: string | null;
  /** null = a platform-wide event, which belongs to no school. */
  schoolName: string | null;
  schoolLogoUrl: string | null;
}

export interface EventInput {
  title: string;
  description?: string | null;
  eventDate: string;
  eventType: EventType;
  audience: EventAudience;
}

export class SystemManagedEventError extends Error {
  constructor() {
    super("This event is generated from an exam — edit the exam's dates instead.");
    this.name = "SystemManagedEventError";
  }
}

interface SchoolEventRow {
  id: string;
  school_id: string | null;
  title: string;
  description: string | null;
  event_date: string;
  event_type: EventType;
  audience: EventAudience;
  school_exam_id: string | null;
  thumbnail_path: string | null;
  thumbnail_provider: StorageProvider | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, school_id, title, description, event_date, event_type, audience, school_exam_id, thumbnail_path, thumbnail_provider, share_token, created_at, updated_at";

// Thumbnails are always images, so the mimeType only has to be image-ish for
// fileUrl() to pick the right resource type. Same reasoning as school logos.
function imageFile(ref: string, provider: StorageProvider | null): StoredFile {
  return { provider: provider ?? "local", ref, mimeType: "image/jpeg" };
}

function mapRow(row: SchoolEventRow): SchoolEventRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    eventType: row.event_type,
    audience: row.audience,
    schoolExamId: row.school_exam_id,
    thumbnailUrl: row.thumbnail_path ? fileUrl(imageFile(row.thumbnail_path, row.thumbnail_provider)) : null,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A school_admin manages every event regardless of audience; everyone else
// only ever sees 'all' plus the one slice that's theirs. Role, not the
// viewer's choice, decides the slice — there's no "view as" toggle.
const ROLE_AUDIENCE: Partial<Record<Role, EventAudience>> = {
  teacher: "staff",
  student: "students",
  parent: "parents",
};

/** A school-scoped viewer's calendar: their own school's events plus every
 *  global (school_id null) event, filtered to their role's audience. */
export async function listSchoolEvents(
  schoolId: string,
  viewerRole: Role,
  range: { from: string; to: string },
): Promise<SchoolEventRecord[]> {
  const conditions = ["(school_id = $1 or school_id is null)", "event_date between $2 and $3"];
  const params: unknown[] = [schoolId, range.from, range.to];

  if (viewerRole !== "school_admin") {
    const audience = ROLE_AUDIENCE[viewerRole];
    params.push(audience ?? "all");
    conditions.push(audience ? `audience in ('all', $${params.length})` : `audience = $${params.length}`);
  }

  const { rows } = await pool.query<SchoolEventRow>(
    `select ${COLUMNS} from school_event where ${conditions.join(" and ")} order by event_date, created_at`,
    params,
  );
  return rows.map(mapRow);
}

/** super_admin's own calendar: global events only — they don't belong to any
 *  one school, so there's nothing school-specific to show them. */
export async function listGlobalEvents(range: { from: string; to: string }): Promise<SchoolEventRecord[]> {
  const { rows } = await pool.query<SchoolEventRow>(
    `select ${COLUMNS} from school_event
     where school_id is null and event_date between $1 and $2
     order by event_date, created_at`,
    [range.from, range.to],
  );
  return rows.map(mapRow);
}

function ownerCondition(schoolId: string | null, paramOffset: number): string {
  return schoolId === null ? "school_id is null" : `school_id = $${paramOffset}`;
}

/** `schoolId: null` reads/writes only global events (super_admin's own);
 *  a real schoolId reads/writes only that school's own events — never global
 *  ones, even though that school can *see* global events via listSchoolEvents. */
export async function getEvent(schoolId: string | null, id: string): Promise<SchoolEventRecord | null> {
  const params: unknown[] = schoolId === null ? [id] : [id, schoolId];
  const { rows } = await pool.query<SchoolEventRow>(
    `select ${COLUMNS} from school_event where id = $1 and ${ownerCondition(schoolId, 2)}`,
    params,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createEvent(
  schoolId: string | null,
  actingUserId: string,
  input: EventInput,
): Promise<SchoolEventRecord> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into school_event (school_id, title, description, event_date, event_type, audience, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      schoolId,
      input.title.trim(),
      input.description?.trim() || null,
      input.eventDate,
      input.eventType,
      input.audience,
      actingUserId,
    ],
  );
  return (await getEvent(schoolId, rows[0].id))!;
}

export async function updateEvent(
  schoolId: string | null,
  id: string,
  input: EventInput,
): Promise<SchoolEventRecord | null> {
  const existing = await getEvent(schoolId, id);
  if (!existing) return null;
  if (existing.schoolExamId) throw new SystemManagedEventError();

  await pool.query(
    `update school_event
     set title = $1, description = $2, event_date = $3, event_type = $4, audience = $5, updated_at = now()
     where id = $6`,
    [input.title.trim(), input.description?.trim() || null, input.eventDate, input.eventType, input.audience, id],
  );
  return getEvent(schoolId, id);
}

export async function deleteEvent(schoolId: string | null, id: string): Promise<boolean> {
  const existing = await getEvent(schoolId, id);
  if (!existing) return false;
  if (existing.schoolExamId) throw new SystemManagedEventError();

  const { rows } = await pool.query<Pick<SchoolEventRow, "thumbnail_path" | "thumbnail_provider">>(
    `delete from school_event where id = $1 returning thumbnail_path, thumbnail_provider`,
    [id],
  );
  const removed = rows[0];
  if (removed?.thumbnail_path) {
    await deleteStoredFile(imageFile(removed.thumbnail_path, removed.thumbnail_provider)).catch(() => {});
  }
  return true;
}

/** Sets or (with null) clears an event's picture. Exam-synced events can have one
 *  too: the picture isn't part of what the exam controls. */
export async function setEventThumbnail(
  schoolId: string | null,
  id: string,
  file: { mimeType: string; data: Buffer } | null,
): Promise<SchoolEventRecord | null> {
  const existing = await getEvent(schoolId, id);
  if (!existing) return null;
  const { rows } = await pool.query<Pick<SchoolEventRow, "thumbnail_path" | "thumbnail_provider">>(
    `select thumbnail_path, thumbnail_provider from school_event where id = $1`,
    [id],
  );
  const prior = rows[0];

  const stored = file ? await storeFile(`event-thumbnails/${id}`, file.mimeType, file.data) : null;
  await pool.query(
    `update school_event set thumbnail_path = $1, thumbnail_provider = $2, updated_at = now() where id = $3`,
    [stored?.ref ?? null, stored?.provider ?? null, id],
  );
  if (prior?.thumbnail_path) {
    await deleteStoredFile(imageFile(prior.thumbnail_path, prior.thumbnail_provider)).catch(() => {});
  }
  return getEvent(schoolId, id);
}

/** Turns on the event's public link, keeping an existing one so links already
 *  sent out keep working. */
export async function enableEventSharing(schoolId: string | null, id: string): Promise<SchoolEventRecord | null> {
  const existing = await getEvent(schoolId, id);
  if (!existing) return null;
  if (existing.shareToken) return existing;
  await pool.query(`update school_event set share_token = $1 where id = $2`, [randomBytes(18).toString("base64url"), id]);
  return getEvent(schoolId, id);
}

/** Switches the public page off. Sharing again makes a new link; the old one stays dead. */
export async function disableEventSharing(schoolId: string | null, id: string): Promise<SchoolEventRecord | null> {
  const existing = await getEvent(schoolId, id);
  if (!existing) return null;
  await pool.query(`update school_event set share_token = null where id = $1`, [id]);
  return getEvent(schoolId, id);
}

export async function getPublicEvent(token: string): Promise<PublicEvent | null> {
  const { rows } = await pool.query<
    Pick<SchoolEventRow, "title" | "description" | "event_date" | "event_type" | "thumbnail_path" | "thumbnail_provider"> & {
      school_name: string | null;
      logo_path: string | null;
      logo_provider: StorageProvider | null;
    }
  >(
    `select e.title, e.description, e.event_date, e.event_type, e.thumbnail_path, e.thumbnail_provider,
            s.name as school_name, s.logo_path, s.logo_provider
       from school_event e
       left join schools s on s.id = e.school_id
      where e.share_token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    eventType: row.event_type,
    thumbnailUrl: row.thumbnail_path ? fileUrl(imageFile(row.thumbnail_path, row.thumbnail_provider)) : null,
    schoolName: row.school_name,
    schoolLogoUrl: row.logo_path ? fileUrl(imageFile(row.logo_path, row.logo_provider)) : null,
  };
}

/** Called by the exams module right after a school_exam is created or its
 *  dates/name change — keeps a matching 'exam' calendar event in sync
 *  without a school_admin re-entering it by hand. Upserts on school_exam_id
 *  (unique, see migration 1700000060000); deleting the exam cascades onto
 *  its event via the same FK, so there's no matching delete function here. */
export async function syncEventForExam(
  schoolId: string,
  schoolExamId: string,
  input: { title: string; eventDate: string },
): Promise<void> {
  await pool.query(
    `insert into school_event (school_id, title, event_date, event_type, audience, school_exam_id)
     values ($1, $2, $3, 'exam', 'all', $4)
     on conflict (school_exam_id) where school_exam_id is not null
     do update set title = excluded.title, event_date = excluded.event_date, updated_at = now()`,
    [schoolId, input.title, input.eventDate, schoolExamId],
  );
}
