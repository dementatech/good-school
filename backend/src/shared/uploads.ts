import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local-disk file storage — the fallback when Cloudinary isn't configured
// (shared/cloudinary.ts), and the only store when it isn't. `UPLOADS_DIR`
// defaults to `<cwd>/uploads`, which is `/app/uploads` in the Docker image
// (see Dockerfile's WORKDIR) — mount that as a volume in production the same
// way docker-compose already does for `postgres-data`, or files vanish on
// redeploy. Callers only ever see a relative path and the `/uploads/*` URL
// built from it.

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

export const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Academic documents are usually a scanned image or a PDF — never anything
// executable, and never SVG (inline-script XSS risk).
export const DOCUMENT_MIME_TO_EXT: Record<string, string> = {
  ...IMAGE_MIME_TO_EXT,
  "application/pdf": "pdf",
};

export class UnsupportedFileTypeError extends Error {
  constructor(acceptedLabel: string) {
    super(`Only ${acceptedLabel} are accepted`);
    this.name = "UnsupportedFileTypeError";
  }
}

export function uploadsRoot(): string {
  return UPLOADS_DIR;
}

/** Called once at server startup — @fastify/static requires its root to already exist. */
export async function ensureUploadsRoot(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

/** Builds the URL a browser fetches this file from, given its stored relative path. */
export function uploadedFileUrl(relativePath: string): string {
  return `/uploads/${relativePath}`;
}

/**
 * Saves a file buffer under `<UPLOADS_DIR>/<subdir>/<random>.<ext>` and
 * returns the relative path to store (e.g. "staff/3f2a...-c1.jpg"). Rejects
 * anything outside `allowedMimeToExt`.
 */
export async function saveLocalFile(
  subdir: string,
  mimeType: string,
  data: Buffer,
  allowedMimeToExt: Record<string, string> = IMAGE_MIME_TO_EXT,
): Promise<string> {
  const ext = allowedMimeToExt[mimeType];
  if (!ext) throw new UnsupportedFileTypeError("JPEG, PNG, or WebP images");

  const dir = path.join(UPLOADS_DIR, subdir);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, filename), data);

  return path.posix.join(subdir, filename);
}

/** Best-effort cleanup of a replaced/removed file — never blocks the caller on failure. */
export async function deleteLocalFile(relativePath: string): Promise<void> {
  await unlink(path.join(UPLOADS_DIR, relativePath)).catch(() => {});
}
