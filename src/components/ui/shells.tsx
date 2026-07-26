import type { ReactNode } from "react";
import { cx } from "./cn";
import { Monogram, Chip } from "./primitives";

/** Dark hero shell (#121212). Borderless; soft hero shadow. M1 fills the slots. */
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
    <section className="rounded-3xl bg-ink px-8 py-9 text-bone shadow-hero">
      <div className="flex items-start gap-5">
        {monogram ? <Monogram initials={monogram} size={56} dark /> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="font-accent text-[16px] text-[rgba(247,244,238,0.7)]">{eyebrow}</p> : null}
          {title ? <h1 className="mt-1 font-display text-[34px] leading-tight">{title}</h1> : null}
        </div>
      </div>
      {facts ? <div className="mt-7 flex flex-wrap gap-x-12 gap-y-4">{facts}</div> : null}
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
