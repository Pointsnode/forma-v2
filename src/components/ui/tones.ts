// Edition One: the hero-tone rotation is collapsed. Hero surfaces are flat charcoal and
// identity comes from content + photography, not a colored ground. Both functions are
// DEPRECATED and return charcoal so existing call sites compile; remove call-site
// dependence as pages are reshaped in the later milestones.

/** @deprecated hero surfaces are charcoal; returns #111111. */
export function heroTone(_id: string): string {
  return "#111111";
}

/** @deprecated hero surfaces are charcoal; returns #111111. */
export function heroToneAt(_i: number): string {
  return "#111111";
}
