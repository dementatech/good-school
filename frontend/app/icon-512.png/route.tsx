import { ImageResponse } from "next/og";

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
          background: "#990000",
          borderRadius: 96,
          fontFamily: "sans-serif",
          fontSize: 256,
          fontWeight: 700,
          color: "#FFCC99",
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
