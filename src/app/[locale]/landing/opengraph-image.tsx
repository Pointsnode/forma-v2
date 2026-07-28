import { ImageResponse } from "next/og";

// A composed OG card for the landing — the v2 wordmark on the bone/ink palette, not
// a raw hero asset. 1200×630, the social-share default.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Forma — Planning, refined.";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f4ee",
          color: "#121212",
        }}
      >
        <div style={{ fontSize: 132, letterSpacing: 2 }}>Forma</div>
        <div style={{ fontSize: 26, letterSpacing: 16, marginTop: 18, color: "#7a6a50" }}>PLANNING, REFINED.</div>
      </div>
    ),
    { ...size },
  );
}
