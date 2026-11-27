import sharp from "sharp";

/** Longest side, in pixels, of a picture shown across a page or a link preview. */
export const DISPLAY_IMAGE_MAX_SIZE = 1600;

/**
 * Turns an uploaded photo into one that loads quickly on a phone: upright (a
 * phone's rotation flag applied), no bigger than DISPLAY_IMAGE_MAX_SIZE, and a
 * progressive JPEG. A 4 MB phone photo comes out at roughly 150 to 300 KB.
 * Metadata, including GPS location, is dropped.
 *
 * Throws if the data isn't a readable image, so the caller can reject the upload.
 */
export async function optimiseDisplayImage(data: Buffer): Promise<{ mimeType: "image/jpeg"; data: Buffer }> {
  const out = await sharp(data, { failOn: "error" })
    .rotate()
    .resize({ width: DISPLAY_IMAGE_MAX_SIZE, height: DISPLAY_IMAGE_MAX_SIZE, fit: "inside", withoutEnlargement: true })
    // A transparent PNG would otherwise turn black where it's see-through.
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toBuffer();
  return { mimeType: "image/jpeg", data: out };
}

/** Longest side, in pixels, of a profile photo (students, staff, own account). */
export const PROFILE_PHOTO_MAX_SIZE = 600;

/**
 * Shrinks an uploaded profile photo to PROFILE_PHOTO_MAX_SIZE as an upright
 * JPEG. A full-size phone photo is several MB and, decoded, tens of MB of
 * memory: a class of them on report cards made headless Chrome's PDF print
 * fail. Returns the upload unchanged when it isn't a readable image, so the
 * caller's own file-type check still rejects it with its usual message.
 */
export async function optimiseProfilePhoto(upload: {
  mimeType: string;
  data: Buffer;
}): Promise<{ mimeType: string; data: Buffer }> {
  try {
    const data = await sharp(upload.data, { failOn: "error" })
      .rotate()
      .resize({ width: PROFILE_PHOTO_MAX_SIZE, height: PROFILE_PHOTO_MAX_SIZE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
    return { mimeType: "image/jpeg", data };
  } catch {
    return upload;
  }
}
