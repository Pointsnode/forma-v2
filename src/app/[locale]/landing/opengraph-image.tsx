import { ImageResponse } from "next/og";

// Edition One social cover: the forma star + lockup on charcoal. 1200x630. The star is a
// data-URI SVG (no font needed); the wordmark + tagline use next/og's bundled default
// face (the brand woff2 faces cannot be embedded in Satori, which takes ttf/otf/woff).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "forma";

const STAR =
  "M0.000,-100.000 L29.289,-70.711 L70.711,-70.711 L70.711,-29.289 L100.000,0.000 L70.711,29.289 L70.711,70.711 L29.289,70.711 L0.000,100.000 L-29.289,70.711 L-70.711,70.711 L-70.711,29.289 L-100.000,0.000 L-70.711,-29.289 L-70.711,-70.711 L-29.289,-70.711 Z";

export default function OpengraphImage() {
  const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-105 -105 210 210" width="118" height="118"><path d="${STAR}" fill="#D7C3A5"/></svg>`;
  const src = `data:image/svg+xml;base64,${Buffer.from(starSvg).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#111111", color: "#F5F2EB" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width="118" height="118" src={src} alt="" />
        <div style={{ fontSize: 92, marginTop: 28 }}>forma</div>
        <div style={{ fontSize: 21, letterSpacing: 14, marginTop: 22, color: "#D7C3A5" }}>WEDDING ATELIER SOFTWARE</div>
      </div>
    ),
    size,
  );
}
