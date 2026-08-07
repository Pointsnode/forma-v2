// Types for the pure plate logic in plate.mjs (kept .mjs so it runs under node --test).
export function menuLetter(sortIndex: number): string;
export function plateVariant(choiceId: string | null | undefined, dietary: string | null | undefined): "empty" | "standard" | "dietary";
export function plateCounts(
  guests: { choiceId: string | null; dietary: string | null; rsvp: string }[],
  letterOf: (choiceId: string) => string | null,
): { byLetter: Record<string, number>; unchosen: number; dietary: number };
