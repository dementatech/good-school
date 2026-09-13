import { ImageResponse } from "next/og";
import { getLogoDataUrl } from "@/lib/pwaIconLogo";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

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
          borderRadius: 36,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders via Satori, not the DOM */}
        <img src={getLogoDataUrl()} width={170} height={170} alt="" />
      </div>
    ),
    { ...size }
  );
}
