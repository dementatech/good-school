import { pool } from "../../../shared/db/index.js";
import {
  DOCUMENT_MIME_TO_EXT,
  deleteStoredFile,
  fileUrl,
  storeFile,
  type StorageProvider,
} from "../../../shared/media.js";

// Academic/certification documents — optional, and self-service: a staff
// member uploads their own after logging in, not just an admin on their
// behalf (see the api layer's ownStaffOrAdmin guard). Deliberately its own
// table rather than a single `staff.cv_url`-style column, since a person can
// reasonably have several (a degree certificate, a TMIS certificate, a
// national ID) and each needs its own title/upload record.

export interface StaffDocumentRecord {
  id: string;
  staffId: string;
  title: string;
  mimeType: string;
  fileUrl: string;
  uploadedBy: string | null;
  createdAt: string;
}

interface StaffDocumentRow {
  id: string;
  staff_id: string;
  title: string;
  mime_type: string;
  file_provider: StorageProvider;
  file_ref: string;
  uploaded_by: string | null;
  created_at: string;
}

function mapRow(row: StaffDocumentRow): StaffDocumentRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    title: row.title,
    mimeType: row.mime_type,
    fileUrl: fileUrl({ provider: row.file_provider, ref: row.file_ref, mimeType: row.mime_type }),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function listStaffDocuments(staffId: string): Promise<StaffDocumentRecord[]> {
  const result = await pool.query<StaffDocumentRow>(
    `select id, staff_id, title, mime_type, file_provider, file_ref, uploaded_by, created_at
     from staff_document where staff_id = $1 order by created_at desc`,
    [staffId],
  );
  return result.rows.map(mapRow);
}

export async function addStaffDocument(
  staffId: string,
  title: string,
  file: { mimeType: string; data: Buffer },
  uploadedBy: string,
): Promise<StaffDocumentRecord> {
  const stored = await storeFile(`staff-documents/${staffId}`, file.mimeType, file.data, DOCUMENT_MIME_TO_EXT);

  const result = await pool.query<StaffDocumentRow>(
    `insert into staff_document (staff_id, title, mime_type, file_provider, file_ref, uploaded_by)
     values ($1, $2, $3, $4, $5, $6)
     returning id, staff_id, title, mime_type, file_provider, file_ref, uploaded_by, created_at`,
    [staffId, title, file.mimeType, stored.provider, stored.ref, uploadedBy],
  );
  return mapRow(result.rows[0]);
}

export async function removeStaffDocument(staffId: string, documentId: string): Promise<boolean> {
  const existing = await pool.query<{ file_provider: StorageProvider; file_ref: string; mime_type: string }>(
    `select file_provider, file_ref, mime_type from staff_document where id = $1 and staff_id = $2`,
    [documentId, staffId],
  );
  if (!existing.rows[0]) return false;

  await pool.query(`delete from staff_document where id = $1 and staff_id = $2`, [documentId, staffId]);

  const row = existing.rows[0];
  await deleteStoredFile({ provider: row.file_provider, ref: row.file_ref, mimeType: row.mime_type });
  return true;
}
