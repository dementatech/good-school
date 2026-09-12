import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded-square mask, so this stays full-bleed with no radius.
export default function AppleIcon() {
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
          fontSize: 90,
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
