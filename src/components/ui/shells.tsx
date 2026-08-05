import type { ReactNode } from "react";
import { cx } from "./cn";
import { Monogram, Chip, DomainStar, type Domain } from "./primitives";

// ── DomainHeadCard — the ONE sanctioned domain field (color-roles law): a domain may tint
// its card HEADER, a single title strip (the money radar wears a teal head), while the body
// stays bone for the reading. Bone title + bone star + bone-alpha meta on the strip; never
// tint the body, never two accents. money=teal, time=champagne (ink type), people=taupe. ──
const STRIP: Record<Domain, { bg: string; on: string; star: string; border: string; meta: string }> = {
  money: { bg: "bg-teal", on: "text-bone", star: "#F5F2EB", border: "border-teal", meta: "text-bone/75" },
  time: { bg: "bg-champagne", on: "text-ink", star: "#111111", border: "border-champagne", meta: "text-ink/60" },
  people: { bg: "bg-taupe", on: "text-bone", star: "#F5F2EB", border: "border-taupe", meta: "text-bone/75" },
};
export function DomainHeadCard({ domain, title, meta, children, className, id }: {
  domain: Domain; title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  const s = STRIP[domain];
  return (
    <div id={id} className={cx("overflow-hidden rounded-[var(--radius)] border bg-surface-card", s.border, className)}>
      <div className={cx("flex items-center justify-between gap-3 px-[18px] py-4", s.bg)}>
        <span className={cx("flex items-center gap-2 font-display text-[18px] leading-none", s.on)}>
          <DomainStar fill={s.star} size={11} />{title}
        </span>
        {meta ? <span className={cx("text-[11px] uppercase tracking-[0.14em]", s.meta)}>{meta}</span> : null}
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}

/** The flat charcoal hero BAND (Edition One): no radius, no shadow. Champagne kicker,
    Playfair bone heading, stat row on a bone-alpha hairline. Same API. (Full-viewport
    bleed and the in-band event bar/sub-nav arrive with the page milestones.) */
export function HeroShell({
  monogram,
  title,
  eyebrow,
  facts,
}: {
  monogram?: string;
  title?: ReactNode;
  eyebrow?: ReactNode;
  facts?: ReactNode;
}) {
  return (
    <section className="bg-ink px-8 py-9 text-bone">
      <div className="flex items-start gap-5">
        {monogram ? <Monogram initials={monogram} size={56} dark /> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="font-accent text-[16px] text-champagne">{eyebrow}</p> : null}
          {title ? <h1 className="mt-1 font-display text-[34px] leading-tight text-bone">{title}</h1> : null}
        </div>
      </div>
      {facts ? <div className="mt-7 flex flex-wrap gap-x-12 gap-y-4 border-t border-hairline-dark pt-5">{facts}</div> : null}
    </section>
  );
}

/** Wedding-level nav bar shell — hairline underline, no container border. */
export function WeddingNav({ items, className }: { items: ReactNode; className?: string }) {
  return (
    <nav className={cx("flex items-center gap-7 pb-3 text-[14px] text-muted [box-shadow:inset_0_-1px_0_var(--color-hairline)]", className)}>
      {items}
    </nav>
  );
}

/** Event switcher strip + event sub-nav shell (empty for M0). */
export function EventBar({ chips, subnav }: { chips?: ReactNode; subnav?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {chips ? <div className="flex items-center gap-2 overflow-x-auto">{chips}</div> : null}
      {subnav ? (
        <nav className="flex items-center gap-6 pb-2 text-[13.5px] text-muted [box-shadow:inset_0_-1px_0_var(--color-hairline)]">
          {subnav}
        </nav>
      ) : null}
    </div>
  );
}

/** Reference row of event chips (M1 wires real events). */
export function EventChips({ labels, activeIndex = 0 }: { labels: string[]; activeIndex?: number }) {
  return (
    <>
      {labels.map((l, i) => (
        <Chip key={i} active={i === activeIndex}>
          {l}
        </Chip>
      ))}
    </>
  );
}
