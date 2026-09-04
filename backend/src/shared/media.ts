import {
  DOCUMENT_MIME_TO_EXT,
  IMAGE_MIME_TO_EXT,
  deleteLocalFile,
  saveLocalFile,
  uploadedFileUrl,
  UnsupportedFileTypeError,
} from "./uploads.js";
import {
  cloudinaryUrl,
  deleteFromCloudinary,
  isCloudinaryConfigured,
  resourceTypeFor,
  uploadToCloudinary,
} from "./cloudinary.js";

// One storage call site for every uploaded file (staff photos, academic
// documents, ...) — Cloudinary when CLOUDINARY_* env vars are set, local
// disk otherwise, same graceful-degradation shape as shared/email/index.ts's
// "no RESEND_API_KEY -> log instead" fallback. Callers store `provider` +
// `ref` (whatever each backend needs to find the file again) and never touch
// either backend directly.

export type StorageProvider = "local" | "cloudinary";

export interface StoredFile {
  provider: StorageProvider;
  ref: string;
  mimeType: string;
}

export { UnsupportedFileTypeError, IMAGE_MIME_TO_EXT, DOCUMENT_MIME_TO_EXT };

export async function storeFile(
  subdir: string,
  mimeType: string,
  data: Buffer,
  allowedMimeToExt: Record<string, string> = IMAGE_MIME_TO_EXT,
): Promise<StoredFile> {
  if (!allowedMimeToExt[mimeType]) {
    const label = allowedMimeToExt === DOCUMENT_MIME_TO_EXT ? "JPEG/PNG/WebP images or PDFs" : "JPEG, PNG, or WebP images";
    throw new UnsupportedFileTypeError(label);
  }

  if (isCloudinaryConfigured()) {
    const { publicId } = await uploadToCloudinary(subdir, mimeType, data);
    return { provider: "cloudinary", ref: publicId, mimeType };
  }

  const relativePath = await saveLocalFile(subdir, mimeType, data, allowedMimeToExt);
  return { provider: "local", ref: relativePath, mimeType };
}

export function fileUrl(file: StoredFile): string {
  if (file.provider === "cloudinary") return cloudinaryUrl(file.ref, resourceTypeFor(file.mimeType));
  return uploadedFileUrl(file.ref);
}

export async function deleteStoredFile(file: StoredFile): Promise<void> {
  if (file.provider === "cloudinary") return deleteFromCloudinary(file.ref, resourceTypeFor(file.mimeType));
  return deleteLocalFile(file.ref);
}
