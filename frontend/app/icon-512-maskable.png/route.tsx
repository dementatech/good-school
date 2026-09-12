import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Maskable icon: OS applies its own mask/rounding, so the background must be
// full-bleed with no corner radius, and the glyph kept inside the ~80% "safe zone".
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
          fontFamily: "sans-serif",
          fontSize: 192,
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
