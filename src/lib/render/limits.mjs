// "Set the scene" cost guards — pure so the page, the button, the server action, and the
// tests all reason about the same numbers (no server-only import, safe in a client component).

export const RENDERS_PER_WEDDING = 25; // lifetime budget the planner reasons about
export const RENDERS_PER_DAY = 15;     // per-studio-per-day runaway brake (UTC day)
export const MAX_REF_IMAGES = 8;       // reference images forwarded to the model
export const RENDERS_LEFT_HINT = 5;    // show "{count} left" when the wedding budget is this low

// The button's disable decision, given the two remaining counts. Per-wedding is checked first
// (it's the number the planner owns); the per-day brake is runaway protection.
export function renderCapState(rendersLeft, dayRemaining) {
  if (rendersLeft <= 0) return { disabled: true, reason: "cap_wedding" };
  if (dayRemaining <= 0) return { disabled: true, reason: "cap_day" };
  return { disabled: false, reason: null };
}
