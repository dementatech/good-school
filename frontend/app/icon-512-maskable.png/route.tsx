import { ImageResponse } from "next/og";
import { getLogoDataUrl } from "@/lib/pwaIconLogo";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Maskable icon: OS applies its own mask/rounding, so the background must be
// full-bleed with no corner radius, and the logo kept inside the ~80% "safe zone".
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders via Satori, not the DOM */}
        <img src={getLogoDataUrl()} width={340} height={340} alt="" />
      </div>
    ),
    { ...size }
  );
}
