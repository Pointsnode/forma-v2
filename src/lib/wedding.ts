// Spine helpers, shared by server pages and client widgets. Pure — the phase
// predicates here MIRROR private.advance_wedding_phase (§9); the DB stays the
// source of truth (it's the only writer of phase), this only renders the same
// truth for the phase line and Planning room.

export type Phase = "hiring" | "foundations" | "details" | "wedding_days" | "closed";
export type WeddingKind = "city" | "destination";
export type EventKind = "ceremony" | "reception" | "dinner" | "party" | "ritual" | "other";

export type WeddingRow = {
  id: string;
  workspace_id?: string;
  couple_display: string;
  phase: Phase;
  kind: WeddingKind | null;
  location_city: string | null;
  location_country: string | null;
  date_start: string | null;
  date_end: string | null;
  guest_target: number | null;
  budget_total: string | number | null;
};

export type EventRow = {
  id: string;
  label: string;
  kind: EventKind;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  order_index: number;
  guest_target: number | null;
};

// The four active phases (closed is "all done"). Dots render in this order.
export const PHASE_ORDER: Phase[] = ["hiring", "foundations", "details", "wedding_days"];

export function phaseOrdinal(p: Phase): number {
  const i = PHASE_ORDER.indexOf(p);
  return i < 0 ? PHASE_ORDER.length : i + 1; // closed → 4
}

export type DotState = "done" | "now" | "ahead";
export function phaseDots(p: Phase): DotState[] {
  if (p === "closed") return PHASE_ORDER.map(() => "done");
  const idx = PHASE_ORDER.indexOf(p);
  return PHASE_ORDER.map((_, i) => (i < idx ? "done" : i === idx ? "now" : "ahead"));
}

export function nextPhase(p: Phase): Phase | null {
  const i = PHASE_ORDER.indexOf(p);
  if (i < 0 || i >= PHASE_ORDER.length - 1) return p === "wedding_days" ? "closed" : null;
  return PHASE_ORDER[i + 1];
}

// Gate predicates for the wedding's CURRENT gate. `pending` marks an item that
// cannot yet be satisfied in this milestone (venue → M4): shown honestly, never
// as clickable-fake. Empty array = the next transition is not predicate-gated
// here (date-driven, or a later milestone).
export type PredicateKey = "budget" | "guests" | "location" | "eventsDated" | "venue";
export type GateItem = { key: PredicateKey; done: boolean; pending?: boolean };

export function gateItems(w: WeddingRow, events: EventRow[]): GateItem[] {
  if (w.phase !== "foundations") return []; // only 2→3 is predicate-gated in M1
  const budget = Number(w.budget_total ?? 0) > 0;
  const guests = (w.guest_target ?? 0) > 0;
  const location = !!w.location_city && !!w.location_country;
  const eventsDated = events.length > 0 && events.every((e) => !!e.event_date);
  return [
    { key: "budget", done: budget },
    { key: "guests", done: guests },
    { key: "location", done: location },
    { key: "eventsDated", done: eventsDated },
    { key: "venue", done: false, pending: true }, // M4, fail-closed
  ];
}

export function itemsToGate(w: WeddingRow, events: EventRow[]): number {
  return gateItems(w, events).filter((i) => !i.done).length;
}

// ── Dates ────────────────────────────────────────────────────────────────────
// event_date / date_start are 'YYYY-MM-DD'. Parse at UTC noon so the calendar
// day never shifts under a timezone.
function parseDay(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

export function countdownDays(dateStart: string | null, now: Date = new Date()): number | null {
  if (!dateStart) return null;
  const start = parseDay(dateStart).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return Math.round((start - today) / 86_400_000);
}

// 1-based day number of an event within the wedding's span.
export function dayNumber(eventDate: string | null, dateStart: string | null): number | null {
  if (!eventDate || !dateStart) return null;
  const diff = (parseDay(eventDate).getTime() - parseDay(dateStart).getTime()) / 86_400_000;
  return Math.floor(diff) + 1;
}

export function formatDateRange(
  start: string | null,
  end: string | null,
  locale: string,
): string | null {
  if (!start) return null;
  const l = locale === "es" ? "es-ES" : "en-US";
  const fmt = (d: string, withYear: boolean) =>
    new Intl.DateTimeFormat(l, { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(parseDay(d));
  if (!end || end === start) return fmt(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

export function formatMoney(amount: string | number | null, locale: string): string | null {
  if (amount == null || Number(amount) === 0) return null;
  const l = locale === "es" ? "es-MX" : "en-US";
  return new Intl.NumberFormat(l, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(amount));
}

export function formatTime(t: string | null, locale: string): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const l = locale === "es" ? "es-ES" : "en-US";
  return new Intl.DateTimeFormat(l, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

export function initials(coupleDisplay: string): string {
  const parts = coupleDisplay.split(/\s*[&y]\s*|\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("·") || coupleDisplay.slice(0, 2).toUpperCase();
}
