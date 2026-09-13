import { ImageResponse } from "next/og";
import { getLogoDataUrl } from "@/lib/pwaIconLogo";

export const size = { width: 512, height: 512 };
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
          borderRadius: 96,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders via Satori, not the DOM */}
        <img src={getLogoDataUrl()} width={452} height={452} alt="" />
      </div>
    ),
    { ...size }
  );
}
