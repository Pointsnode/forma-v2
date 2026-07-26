import type { ReactNode } from "react";
import { cx } from "./cn";

/** Borderless surface on soft shadow — the v2 card. No borders, no gradients. */
export function Card({ children, className, lift = false }: { children: ReactNode; className?: string; lift?: boolean }) {
  return (
    <div className={cx("rounded-2xl bg-bone p-6", lift ? "shadow-lift" : "shadow-card", className)}>{children}</div>
  );
}

/** Playfair section heading. */
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("font-display text-[22px] leading-tight text-ink", className)}>{children}</h2>;
}

/** Cormorant accent line (facts, labels). */
export function Accent({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-accent text-[17px] text-taupe", className)}>{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-[11px] font-medium uppercase tracking-[0.16em] text-muted", className)}>{children}</p>
  );
}

export type PillTone = "ink" | "bone" | "sand" | "wine" | "sage";
const PILL: Record<PillTone, string> = {
  ink: "bg-ink text-bone",
  bone: "bg-bone text-ink shadow-card",
  sand: "bg-sand-soft text-taupe",
  wine: "bg-wine-soft text-wine",
  sage: "bg-sage-soft text-sage-ink",
};

/** Monochrome / soft-status pill. */
export function Pill({ children, tone = "bone", className }: { children: ReactNode; tone?: PillTone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px]", PILL[tone], className)}>
      {children}
    </span>
  );
}

/** Event chip — a smaller pill for the event switcher / nav. */
export function Chip({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[12.5px] transition-colors",
        active ? "bg-ink text-bone" : "bg-transparent text-muted hover:text-ink"
      )}
    >
      {children}
    </span>
  );
}

export type ButtonProps = {
  children: ReactNode;
  type?: "button" | "submit";
  variant?: "solid" | "ghost";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

/** Ink solid / ghost button. No gradients. */
export function Button({ children, type = "button", variant = "solid", disabled, className, onClick }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[14px] font-medium transition-opacity disabled:opacity-50",
        variant === "solid" ? "bg-ink text-bone hover:opacity-90" : "bg-transparent text-ink hover:text-taupe",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Hairline serif monogram circle — the couple/workspace mark. */
export function Monogram({ initials, size = 44, dark = false }: { initials: string; size?: number; dark?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex items-center justify-center rounded-full font-accent",
        dark ? "text-bone ring-[rgba(247,244,238,0.35)]" : "text-ink ring-hairline",
        "ring-1"
      )}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials}</span>
    </span>
  );
}

/** A labelled fact (stat strip cell): big number + Cormorant caption. */
export function Fact({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[26px] leading-none text-ink">{value}</span>
      <span className="font-accent text-[15px] text-muted">{label}</span>
    </div>
  );
}
