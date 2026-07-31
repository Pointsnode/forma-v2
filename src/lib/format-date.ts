// §B4 — the single date-formatting seam. Every primary date surface routes through
// here so the account's timezone + date-format preference (profiles.timezone,
// profiles.date_format) is honoured in ONE place instead of scattered
// toLocaleDateString calls. Render-time only: it never mutates a stored UTC value —
// the input is a UTC instant, the output is that instant read in the chosen zone.

export type DateFormat = "auto" | "DMY" | "MDY" | "YMD";

export type DatePrefs = {
  locale: string; // "en" | "es" — drives month names and the 'auto' order
  tz: string; // IANA zone, e.g. "America/Mexico_City"
  format: DateFormat;
};

const AUTO: Record<string, DateFormat> = { es: "DMY", en: "MDY" };

// Defensive: an invalid stored tz would throw in DateTimeFormat and take down every date
// render for that account. Fall back to UTC rather than crash (saveRegion guards the
// write, so this only catches pre-existing bad data).
function dtf(locale: string, tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const lc = locale === "es" ? "es-MX" : "en-US";
  try {
    return new Intl.DateTimeFormat(lc, { timeZone: tz, ...opts });
  } catch {
    return new Intl.DateTimeFormat(lc, { timeZone: "UTC", ...opts });
  }
}

function parts(value: Date | string, tz: string, locale: string) {
  const d = value instanceof Date ? value : new Date(value);
  const map = new Map(dtf(locale, tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { y: map.get("year") ?? "", m: map.get("month") ?? "", d: map.get("day") ?? "" };
}

// A numeric date honouring the account's zone + order preference. 'auto' derives the
// order from the locale (es→DMY, en→MDY); the explicit orders pin it regardless. A bare
// DATE-typed value (YYYY-MM-DD, e.g. a due date) is a calendar date, not an instant, so
// it is reordered verbatim WITHOUT a timezone shift — applying a zone would wrongly move
// "2027-01-15" to the day before in a negative-offset zone.
export function formatDate(value: Date | string | null | undefined, prefs: DatePrefs): string {
  if (value == null || value === "") return "—";
  const order = prefs.format === "auto" ? AUTO[prefs.locale] ?? "MDY" : prefs.format;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return order === "DMY" ? `${d}/${m}/${y}` : order === "YMD" ? `${y}-${m}-${d}` : `${m}/${d}/${y}`;
  }
  const { y, m, d } = parts(value, prefs.tz, prefs.locale);
  if (!y) return "—";
  return order === "DMY" ? `${d}/${m}/${y}` : order === "YMD" ? `${y}-${m}-${d}` : `${m}/${d}/${y}`;
}

// A longer, human date (weekday + month name) in the account's zone — for headers and
// the cockpit greeting. The date-format order preference doesn't reorder a spelled-out
// month, so this honours zone + locale only (month names stay locale-native, lowercase
// in es exactly as Intl yields them — never CSS-capitalised).
export function formatLongDate(value: Date | string | null | undefined, prefs: DatePrefs): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(value);
  return dtf(prefs.locale, prefs.tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
}
