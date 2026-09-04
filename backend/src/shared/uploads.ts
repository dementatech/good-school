import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local-disk file storage — no Cloudinary/S3 account needed to get a real
// upload working today. `UPLOADS_DIR` defaults to `<cwd>/uploads`, which is
// `/app/uploads` in the Docker image (see Dockerfile's WORKDIR) — mount that
// as a volume in production the same way docker-compose already does for
// `postgres-data`, or photos vanish on redeploy. Swappable for real object
// storage later without touching callers: they only ever see a relative
// `photo_path` and the `/uploads/*` URL built from it.

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class UnsupportedImageTypeError extends Error {
  constructor() {
    super("Only JPEG, PNG, or WebP images are accepted");
    this.name = "UnsupportedImageTypeError";
  }
}

export function uploadsRoot(): string {
  return UPLOADS_DIR;
}

/** Called once at server startup — @fastify/static requires its root to already exist. */
export async function ensureUploadsRoot(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

/** Builds the URL a browser fetches this file from, given its stored `photo_path`. */
export function uploadedFileUrl(relativePath: string): string {
  return `/uploads/${relativePath}`;
}

/**
 * Saves a photo buffer under `<UPLOADS_DIR>/<subdir>/<random>.<ext>` and
 * returns the relative path to store (e.g. "staff/3f2a...-c1.jpg"). Rejects
 * anything that isn't a plain image — no SVG (XSS via inline script), no
 * arbitrary file types riding in on a mislabeled upload.
 */
export async function saveUploadedImage(
  subdir: string,
  mimeType: string,
  data: Buffer,
): Promise<string> {
  const ext = ALLOWED_MIME_TO_EXT[mimeType];
  if (!ext) throw new UnsupportedImageTypeError();

  const dir = path.join(UPLOADS_DIR, subdir);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, filename), data);

  return path.posix.join(subdir, filename);
}

/** Best-effort cleanup of a replaced/removed photo — never blocks the caller on failure. */
export async function deleteUploadedFile(relativePath: string): Promise<void> {
  await unlink(path.join(UPLOADS_DIR, relativePath)).catch(() => {});
}
