// The 16-point forma star (never rotated, never beside the wordmark on one line) and the
// lowercase italic-f wordmark. Shared across the landing and the subpages.
export const STAR =
  "M0.000,-100.000 L29.289,-70.711 L70.711,-70.711 L70.711,-29.289 L100.000,0.000 L70.711,29.289 L70.711,70.711 L29.289,70.711 L0.000,100.000 L-29.289,70.711 L-70.711,70.711 L-70.711,29.289 L-100.000,0.000 L-70.711,-29.289 L-70.711,-70.711 L-29.289,-70.711 Z";

export function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="-105 -105 210 210" aria-hidden="true">
      <path d={STAR} fill={fill} />
    </svg>
  );
}

// Wordmark: lowercase, italic f. Never all caps.
export function Wordmark() {
  return (
    <>
      <i>f</i>orma
    </>
  );
}
