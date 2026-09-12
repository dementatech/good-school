import { ImageResponse } from "next/og";

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
          background: "#990000",
          borderRadius: 36,
          fontFamily: "sans-serif",
          fontSize: 96,
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
