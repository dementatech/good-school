import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/** Base64 data URL for the brand mark (public/icon.png), for embedding in next/og ImageResponse routes. */
export function getLogoDataUrl(): string {
  if (!cached) {
    const buf = readFileSync(path.join(process.cwd(), "public", "icon.png"));
    cached = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return cached;
}
