import type { ReactNode } from "react";
import { cx } from "./cn";

// Edition One foundation. Every drawn container/control uses radius var(--radius)=4px and
// NO shadow (bone ground, 1px hairline). Status color lives ONLY in chips (Badge/Pill map
// to the chip grammar below). Signatures are unchanged so call sites restyle for free.

const RADIUS = "rounded-[var(--radius)]";

/** Card: raised surface, 1px hairline border, radius token, no shadow. Surface + hairline
    resolve through the themeable tokens (bone in day, the raised night tone under night). */
export function Card({ children, className, id }: { children: ReactNode; className?: string; lift?: boolean; id?: string }) {
  return (
    <div id={id} className={cx(RADIUS, "border border-hairline-token bg-surface-card p-6", className)}>{children}</div>
  );
}

/** Playfair section heading (never below 18px). */
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("font-display text-[22px] leading-tight text-text-primary", className)}>{children}</h2>;
}

/** Cormorant accent line. */
export function Accent({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-accent text-[17px] text-taupe", className)}>{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-[11px] font-medium uppercase tracking-[0.16em] text-text-meta", className)}>{children}</p>
  );
}

// ── Chip grammar (the ONLY place status color appears) ────────────────────────────
// settled = solid teal (paid/booked/on track/done) · attention = solid wine (due/needs a
// hand) · urgent = solid oxblood (needs you today) · pending = taupe outline (quoted/
// waiting/drafting) · time = solid champagne (date/count tokens only). 9.5px, 500, .14em.
//
// URGENCY IS EARNED, NEVER FELT. The oxblood `urgent` tier appears ONLY on a written rule
// the data already knows — a payment past its due date, a contract expired, a wedding
// inside seven days with a critical item open — never by judgment call. If a screen shows
// more than one or two, the studio is having a hard week; the color must never soften into
// a mood. Everything merely needing a hand stays wine `attention`.
export type ChipTone = "settled" | "attention" | "urgent" | "pending" | "time";
const CHIP_TONE: Record<ChipTone, string> = {
  settled: "bg-teal text-bone",
  attention: "bg-wine text-bone",
  urgent: "bg-oxblood text-bone",
  pending: "border border-taupe text-taupe",
  time: "bg-champagne text-text-primary",
};
const CHIP_BASE = cx("inline-flex shrink-0 items-center whitespace-nowrap px-2.5 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.14em]", RADIUS);

export type PillTone = "ink" | "bone" | "sand" | "wine" | "sage";
// Old pill tones map onto the chip grammar. ink/bone are non-status labels.
const PILL: Record<PillTone, string> = {
  ink: "bg-surface-chrome text-bone",
  bone: "border border-hairline-token bg-surface-card text-text-primary",
  sand: CHIP_TONE.pending,
  wine: CHIP_TONE.attention,
  sage: CHIP_TONE.settled,
};
export function Pill({ children, tone = "bone", className }: { children: ReactNode; tone?: PillTone; className?: string }) {
  return <span className={cx(CHIP_BASE, "gap-1.5", PILL[tone], className)}>{children}</span>;
}

/** Event/tab chip: active = charcoal solid, inactive = quiet. Radius token, no pill circle. */
export function Chip({ children, active = false, tone }: { children: ReactNode; active?: boolean; tone?: ChipTone }) {
  if (tone) return <span className={cx(CHIP_BASE, CHIP_TONE[tone])}>{children}</span>;
  return (
    <span className={cx("inline-flex shrink-0 items-center px-3 py-1 text-[12.5px] transition-colors", RADIUS, active ? "bg-surface-chrome text-bone" : "bg-transparent text-text-meta hover:text-text-primary")}>
      {children}
    </span>
  );
}

export type ButtonProps = {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "solid" | "ghost" | "primary" | "dark";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

// primary = wine solid · dark/solid = charcoal solid · ghost = 1px charcoal outline.
// Uppercase 11px, 500, .16em, radius, no shadow. ("solid" kept = dark for back-compat.)
// dark/solid carry a themeable edge: transparent on bone (day is byte-for-byte), a bone-alpha
// hairline on night so the charcoal fill stays distinct from the near-black room.
const BTN: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-wine text-bone hover:opacity-90",
  dark: "bg-surface-chrome text-bone border border-[color:var(--color-button-edge)] hover:opacity-90",
  solid: "bg-surface-chrome text-bone border border-[color:var(--color-button-edge)] hover:opacity-90",
  ghost: "border border-[color:var(--color-text-primary)] bg-transparent text-text-primary hover:bg-surface-chrome hover:text-bone",
};
export function Button({ children, type = "button", variant = "solid", disabled, className, onClick }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx("inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-opacity disabled:opacity-50", RADIUS, BTN[variant], className)}
    >
      {children}
    </button>
  );
}

/** Square monogram (no circles): bone/charcoal ground, hairline border, radius, Playfair. */
export function Monogram({ initials, size = 44, dark = false }: { initials: string; size?: number; dark?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cx("inline-flex items-center justify-center border font-display", RADIUS, dark ? "border-hairline-dark text-bone" : "border-hairline-token text-text-primary")}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials}</span>
    </span>
  );
}

/** A labelled fact: big number + Cormorant caption. */
export function Fact({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[26px] leading-none text-text-primary">{value}</span>
      <span className="font-accent text-[15px] text-text-meta">{label}</span>
    </div>
  );
}

// ── Status badge → the chip grammar. sage→settled, wine→attention, sand→pending,
// maroon→attention, ink→charcoal solid (non-status label). ──
export type BadgeTone = "sand" | "wine" | "sage" | "maroon" | "ink";
const BADGE: Record<BadgeTone, string> = {
  sand: CHIP_TONE.pending,
  wine: CHIP_TONE.attention,
  sage: CHIP_TONE.settled,
  maroon: CHIP_TONE.attention,
  ink: "bg-surface-chrome text-bone",
};
export function Badge({ children, tone = "sand", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={cx(CHIP_BASE, BADGE[tone], className)}>{children}</span>;
}

/** Hairline square glyph holding a serif initial (list glyph; no circles). */
export function Icon({ children, size = 36 }: { children: ReactNode; size?: number }) {
  return (
    <span style={{ width: size, height: size }} className={cx("flex shrink-0 items-center justify-center border border-hairline-token font-accent italic text-taupe", RADIUS)}>
      <span style={{ fontSize: Math.round(size * 0.44) }}>{children}</span>
    </span>
  );
}

// ── Presence badge — who holds the ball. planner people(taupe) · couple wine · vendor teal.
export type Who = "planner" | "couple" | "vendor";
const WHO: Record<Who, string> = { planner: "bg-taupe text-bone", couple: "bg-wine text-bone", vendor: "bg-teal text-bone" };
export function WhoBadge({ who, children, size = 22, title }: { who: Who; children: ReactNode; size?: number; title?: string }) {
  return (
    <span title={title} style={{ width: size, height: size }} className={cx("inline-flex shrink-0 items-center justify-center font-semibold tracking-[0.02em]", RADIUS, WHO[who])}>
      <span style={{ fontSize: Math.max(8.5, Math.round(size * 0.39)) }}>{children}</span>
    </span>
  );
}

/** Small taupe keyword tag. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className={cx("mr-1 mt-[3px] inline-block border border-hairline-token bg-surface-card px-[9px] py-[2px] text-[10.5px] text-taupe", RADIUS)}>{children}</span>;
}

// ── DomainStar — the 8-point forma star marking a domain section. money=teal,
// time=champagne, people=taupe; or an explicit fill for chrome (charcoal, bone). ──
const STAR_PATH =
  "M0.000,-100.000 L29.289,-70.711 L70.711,-70.711 L70.711,-29.289 L100.000,0.000 L70.711,29.289 L70.711,70.711 L29.289,70.711 L0.000,100.000 L-29.289,70.711 L-70.711,70.711 L-70.711,29.289 L-100.000,0.000 L-70.711,-29.289 L-70.711,-70.711 L-29.289,-70.711 Z";
const DOMAIN_FILL = { money: "#2F5552", time: "#D7C3A5", people: "#8A7557" } as const;
export type Domain = keyof typeof DOMAIN_FILL;
export function DomainStar({ domain, fill, size = 12 }: { domain?: Domain; fill?: string; size?: number }) {
  const f = fill ?? (domain ? DOMAIN_FILL[domain] : "#111111");
  return (
    <svg width={size} height={size} viewBox="-105 -105 210 210" aria-hidden="true" style={{ flex: "none" }}>
      <path d={STAR_PATH} fill={f} />
    </svg>
  );
}

// ── The wordmark. ALWAYS lowercase with the italic f, Playfair. Never capitalized, never
// roman — it is the mark, not prose. Colour comes from className (charcoal on bone,
// bone on charcoal). ──
export function Wordmark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("font-display leading-none text-text-primary", className)} style={{ fontSize: size }} aria-label="forma">
      <i>f</i>orma
    </span>
  );
}

/** The signed lockup: the forma star centred ABOVE the wordmark (never beside it), as the
    landing footer draws it. For focused entry surfaces — auth and invites. */
export function SignedMark({ size = 26, starSize = 18, className }: { size?: number; starSize?: number; className?: string }) {
  return (
    <span className={cx("inline-flex flex-col items-center gap-2.5", className)}>
      <DomainStar fill="#111111" size={starSize} />
      <Wordmark size={size} />
    </span>
  );
}
