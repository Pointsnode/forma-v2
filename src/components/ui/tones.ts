// A stable, solid brand hero tone per wedding/vendor id — no gradients, just a
// deterministic pick from the prototype's hero palette (sage/wine/taupe/ink/…).
const HERO_TONES = ["#4E5C47", "#5C2B35", "#8A7355", "#1E1E1E", "#6B5A41", "#3A1A20"];

export function heroTone(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HERO_TONES[h % HERO_TONES.length];
}
