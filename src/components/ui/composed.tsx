import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cn";

// ── Stat strip — the composed .stats row: paper surface, hairline-divided cells,
// big Playfair numeral over a small-caps label, optional sub. Wraps on narrow.
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap overflow-hidden rounded-[var(--radius)] border border-hairline bg-bone", className)}>{children}</div>;
}

export function Stat({ value, label, sub, valueClassName }: { value: ReactNode; label: ReactNode; sub?: ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-[45%] flex-1 px-[22px] py-[18px] not-last:[box-shadow:inset_-1px_0_0_var(--color-hairline)] sm:min-w-0">
      <div className={cx("font-display text-[26px] leading-none text-ink", valueClassName)}>{value}</div>
      <div className="mt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-muted">{label}</div>
      {sub ? <div className="mt-1 text-[11.5px] text-taupe">{sub}</div> : null}
    </div>
  );
}

// ── Section header — .section-title: Playfair heading + italic Cormorant accent,
// optional trailing action.
export function SectionTitle({ title, accent, action, className }: { title: ReactNode; accent?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3.5 mt-8 flex items-baseline justify-between gap-4", className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-[24px] leading-tight text-ink">{title}</h2>
        {accent ? <span className="font-accent text-[16px] italic text-taupe">{accent}</span> : null}
      </div>
      {action}
    </div>
  );
}

// ── Bento — three-column card grid; a card may span two (`wide`). ──────────────
export function Bento({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-1 gap-4 md:grid-cols-3", className)}>{children}</div>;
}

/** A bento card: solid brand hero (no gradient) over a body. `href` makes it a link. */
export function BentoCard({
  tone, heroLeft, heroRight, heroHeight = 118, wide, children, className,
}: {
  tone: string;
  heroLeft?: ReactNode;
  heroRight?: ReactNode;
  heroHeight?: number;
  wide?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const heroStyle: CSSProperties = { background: tone, height: heroHeight };
  return (
    <div className={cx("flex flex-col overflow-hidden rounded-[var(--radius)] border border-hairline bg-bone", wide && "md:col-span-2", className)}>
      <div className="flex items-end justify-between p-3.5 text-[rgba(255,253,249,0.95)]" style={heroStyle}>
        <span className="font-accent text-[14px] italic leading-tight">{heroLeft}</span>
        {heroRight}
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

/** The large serif element inside a bento hero. */
export function BentoBig({ children, size = 26 }: { children: ReactNode; size?: number }) {
  return <span className="font-display leading-none" style={{ fontSize: size }}>{children}</span>;
}

/** Foot row of a bento body — status badge on the left, links pushed after. */
export function BentoFoot({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">{children}</div>;
}

// ── Gate card — the dark §9 predicate checklist. ──────────────────────────────
export function GateCard({ title, sub, children, className }: { title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-[var(--radius)] bg-ink p-6 text-bone", className)}>
      <h3 className="font-display text-[19px] text-bone">{title}</h3>
      {sub ? <p className="mb-3.5 mt-0.5 text-[12.5px] text-[#B8AFA2]">{sub}</p> : <div className="mb-3.5" />}
      <div>{children}</div>
    </div>
  );
}

export function GateRow({ done, title, detail }: { done: boolean; title: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 py-3 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline-dark)]">
      <Check ok={done} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-bone">{title}</div>
        {detail ? <div className="mt-0.5 text-[12px] text-[#948C7F]">{detail}</div> : null}
      </div>
    </div>
  );
}

/** Sage check (done) / hairline dot (todo) — the prototype's .check. */
export function Check({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius)] bg-teal text-[11px] text-bone">✓</span>
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius)] text-[11px] text-[#948C7F] border border-hairline-dark">·</span>
  );
}

// ── List row — the .row: leading glyph, grow title/detail, trailing badge/amt. ─
export function Row({ children, onDark, className }: { children: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center gap-3.5 py-3",
        onDark
          ? "not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline-dark)]"
          : "not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Row body — bold title with an optional muted detail line. */
export function RowMain({ title, detail, className }: { title: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 flex-1", className)}>
      <div className="text-[13.5px] font-medium text-ink">{title}</div>
      {detail ? <div className="mt-px text-[12px] text-muted">{detail}</div> : null}
    </div>
  );
}
