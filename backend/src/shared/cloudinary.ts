import { createHash } from "node:crypto";

// Cloudinary via one signed fetch, no SDK — same "no dependency until it
// earns one" approach as shared/email/index.ts's Resend client. With no
// CLOUDINARY_* set, isCloudinaryConfigured() is false and callers fall back
// to local disk (shared/uploads.ts) instead of failing.

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export type CloudinaryResourceType = "image" | "raw";

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
}

// image/* goes through Cloudinary's image pipeline (transformations,
// thumbnails); everything else (PDFs, mainly) is a "raw" asset — the
// resource type has to match on both upload and later delete/URL-building.
export function resourceTypeFor(mimeType: string): CloudinaryResourceType {
  return mimeType.startsWith("image/") ? "image" : "raw";
}

function sign(params: Record<string, string>): string {
  if (!API_SECRET) throw new Error("Cloudinary is not configured");
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(toSign + API_SECRET).digest("hex");
}

export async function uploadToCloudinary(
  folder: string,
  mimeType: string,
  data: Buffer,
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary is not configured");
  const resourceType = resourceTypeFor(mimeType);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign({ folder, timestamp });

  const form = new FormData();
  form.append("file", new Blob([data], { type: mimeType }));
  form.append("api_key", API_KEY!);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { public_id: string; secure_url: string };
  return { publicId: json.public_id, secureUrl: json.secure_url };
}

export function cloudinaryUrl(publicId: string, resourceType: CloudinaryResourceType): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/${resourceType}/upload/${publicId}`;
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: CloudinaryResourceType,
): Promise<void> {
  if (!isCloudinaryConfigured()) return;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign({ public_id: publicId, timestamp });

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", API_KEY!);
  form.append("timestamp", timestamp);
  form.append("signature", signature);

  await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`, {
    method: "POST",
    body: form,
  }).catch(() => {});
}
